"""Item codes from the store classification: Item Group prefix (Category + Group + Sub-group,
2 digits each) followed by a 4-digit running number, e.g. 404060 + 0069 = 4040600069."""
import json
import os
import re

import frappe
from frappe.model.naming import getseries
from frappe.utils import cint

RUNNING_DIGITS = 4
PREFIX_FIELD = "custom_item_code_prefix"
PREFIX_PATTERN = re.compile(r"\d{2,8}")


def _series_key(prefix):
	return "jagadamba-item-" + prefix


def get_prefix(item_group):
	return ((item_group and frappe.db.get_value("Item Group", item_group, PREFIX_FIELD)) or "").strip()


def set_item_code(doc, method=None):
	"""Item before_insert. A code already in the group's pattern (an import of existing items) is
	kept and the counter moves past it; anything else is replaced by the next number."""
	prefix = get_prefix(doc.get("item_group"))
	if not prefix:
		return
	code = (doc.get("item_code") or "").strip().rstrip("*").strip()
	if re.fullmatch(re.escape(prefix) + rf"\d{{{RUNNING_DIGITS}}}", code):
		_raise_counter(prefix, int(code[len(prefix):]))
	else:
		code = _next_code(prefix)
	doc.item_code = code


def _next_code(prefix):
	# Skips numbers already taken by items created outside this counter.
	for _ in range(100):
		number = cint(getseries(_series_key(prefix), RUNNING_DIGITS))
		if number >= 10 ** RUNNING_DIGITS:
			frappe.throw(frappe._("Item Group with prefix {0} has used all {1}-digit item numbers.").format(
				prefix, RUNNING_DIGITS))
		code = f"{prefix}{number:0{RUNNING_DIGITS}d}"
		if not frappe.db.exists("Item", code):
			return code
	frappe.throw(frappe._("Could not find a free item code for prefix {0}.").format(prefix))


def _raise_counter(prefix, number):
	key = _series_key(prefix)
	current = frappe.db.sql("SELECT `current` FROM `tabSeries` WHERE `name`=%s FOR UPDATE", (key,))
	if not current:
		frappe.db.sql("INSERT INTO `tabSeries` (`name`, `current`) VALUES (%s, %s)", (key, number))
	elif cint(current[0][0]) < number:
		frappe.db.sql("UPDATE `tabSeries` SET `current`=%s WHERE `name`=%s", (number, key))


def _highest_existing(prefix):
	pattern = f"^{prefix}[0-9]{{{RUNNING_DIGITS}}}$"
	result = frappe.db.sql("SELECT MAX(CAST(SUBSTRING(`name`, %s) AS UNSIGNED)) FROM `tabItem` WHERE `name` REGEXP %s",
		(len(prefix) + 1, pattern))
	return cint(result and result[0][0])


def validate_item_group(doc, method=None):
	prefix = (doc.get(PREFIX_FIELD) or "").strip()
	doc.set(PREFIX_FIELD, prefix)
	if not prefix:
		return
	if not PREFIX_PATTERN.fullmatch(prefix):
		frappe.throw(frappe._("Item Code Prefix must be 2 to 8 digits."))
	other = frappe.db.get_value("Item Group", {PREFIX_FIELD: prefix, "name": ["!=", doc.name]})
	if other:
		frappe.throw(frappe._("Item Code Prefix {0} is already used by Item Group {1}.").format(prefix, other))
	parent_prefix = get_prefix(doc.get("parent_item_group"))
	if parent_prefix and not prefix.startswith(parent_prefix):
		frappe.throw(frappe._("Item Code Prefix must start with the parent group's prefix {0}.").format(parent_prefix))


def sync_item_group_counter(doc, method=None):
	"""Item Group on_update: items created before the prefix was set keep their numbers free."""
	prefix = doc.get(PREFIX_FIELD)
	if prefix:
		_raise_counter(prefix, _highest_existing(prefix))


@frappe.whitelist()
def get_item_code_preview(item_group):
	"""Next code for the Item form; the number is only taken when the Item is saved."""
	if not frappe.has_permission("Item", "create"):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
	prefix = get_prefix(item_group)
	if not prefix:
		return None
	current = frappe.db.sql("SELECT `current` FROM `tabSeries` WHERE `name`=%s", (_series_key(prefix),))
	number = max(cint(current and current[0][0]), _highest_existing(prefix)) + 1
	return {"prefix": prefix, "next": f"{prefix}{number:0{RUNNING_DIGITS}d}"}


def create_item_groups():
	"""Creates the store classification as Item Groups (bench --site SITE execute
	jagadamba.jagadamba.item_code.create_item_groups). Groups that already carry a prefix are left alone."""
	path = os.path.join(os.path.dirname(__file__), "data", "item_classification.json")
	with open(path) as handle:
		entries = json.load(handle)
	root = frappe.db.get_value("Item Group", {"is_group": 1, "parent_item_group": ["is", "not set"]}) or "All Item Groups"
	parents = {entry["parent"] for entry in entries if entry["parent"]}
	created = 0
	for entry in entries:
		prefix = entry["prefix"]
		if frappe.db.get_value("Item Group", {PREFIX_FIELD: prefix}):
			continue
		parent = frappe.db.get_value("Item Group", {PREFIX_FIELD: entry["parent"]}) if entry["parent"] else root
		frappe.get_doc({
			"doctype": "Item Group",
			"item_group_name": f"{prefix} - {entry['description']}",
			"parent_item_group": parent,
			"is_group": 1 if prefix in parents else 0,
			PREFIX_FIELD: prefix,
		}).insert()
		created += 1
	return created
