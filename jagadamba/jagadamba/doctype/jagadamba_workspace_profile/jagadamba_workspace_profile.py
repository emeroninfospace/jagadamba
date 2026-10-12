import json

import frappe
from frappe import _
from frappe.model.document import Document

from jagadamba.jagadamba.workspace_dashboard import FILTER_OPERATORS, NUMERIC_TYPES, STANDARD_FIELDS


class JagadambaWorkspaceProfile(Document):
	def validate(self):
		for row in self.sources:
			validate_source(row)

	def on_update(self):
		# Landing workspaces are resolved into each user's cached boot info.
		frappe.cache.delete_key("bootinfo")

	def on_trash(self):
		frappe.cache.delete_key("bootinfo")


def validate_source(row):
	"""Reject configuration that names unknown fields; values are still permission-checked at runtime."""
	if not frappe.db.exists("DocType", row.source_doctype):
		frappe.throw(_("Row {0}: DocType {1} does not exist.").format(row.idx, row.source_doctype))
	meta = frappe.get_meta(row.source_doctype)

	def check(fieldname, label, numeric=False):
		if not fieldname:
			return
		if fieldname in STANDARD_FIELDS and not numeric:
			return
		field = meta.get_field(fieldname)
		if not field:
			frappe.throw(_("Row {0}: {1} has no field {2} ({3}).").format(row.idx, row.source_doctype, fieldname, label))
		if numeric and field.fieldtype not in NUMERIC_TYPES:
			frappe.throw(_("Row {0}: {1} must be a number or currency field.").format(row.idx, label))

	check(row.date_field, _("Date Field"))
	check(row.status_field, _("Status Field"))
	check(row.party_field, _("Top By Field"))
	check(row.amount_field, _("Amount Field"), numeric=True)
	check(row.secondary_amount_field, _("Second Amount Field"), numeric=True)
	for fieldname in ("extra_filters", "alert_filters"):
		text = row.get(fieldname)
		if not text:
			continue
		try:
			filters = json.loads(text)
		except ValueError:
			frappe.throw(_("Row {0}: {1} must be valid JSON.").format(row.idx, row.meta.get_label(fieldname)))
		if not isinstance(filters, dict):
			frappe.throw(_("Row {0}: filters must be a JSON object.").format(row.idx))
		for key, value in filters.items():
			check(key, key)
			if isinstance(value, list) and (len(value) != 2 or value[0] not in FILTER_OPERATORS):
				frappe.throw(_("Row {0}: use [operator, value] for {1}.").format(row.idx, key))
