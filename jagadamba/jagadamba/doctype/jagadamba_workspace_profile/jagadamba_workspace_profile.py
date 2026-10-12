import json

import frappe
from frappe import _
from frappe.model.document import Document

from jagadamba.jagadamba.workspace_dashboard import FILTER_OPERATORS, NUMERIC_TYPES, STANDARD_FIELDS


class JagadambaWorkspaceProfile(Document):
	def validate(self):
		for row in self.sources:
			validate_source(row)
		for row in self.kpis:
			validate_source(row, value_fields=("value_field",), date_fields=("date_field",),
				filter_fields=("filters", "secondary_filters"))
			if row.aggregate == "Sum" and not row.value_field:
				frappe.throw(_("Snapshot card {0}: set the Sum Field.").format(row.idx))
		for row in self.series:
			validate_source(row, value_fields=("amount_field",), date_fields=("date_field",), filter_fields=("filters",))

	def on_update(self):
		# Landing workspaces are resolved into each user's cached boot info.
		frappe.cache.delete_key("bootinfo")

	def on_trash(self):
		frappe.cache.delete_key("bootinfo")


def validate_source(row, value_fields=("amount_field", "secondary_amount_field"),
		date_fields=("date_field", "status_field", "party_field"), filter_fields=("extra_filters", "alert_filters")):
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

	for fieldname in date_fields:
		check(row.get(fieldname), row.meta.get_label(fieldname))
	for fieldname in value_fields:
		check(row.get(fieldname), row.meta.get_label(fieldname), numeric=True)
	for fieldname in filter_fields:
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
