import re
import frappe
from frappe.utils import today, get_fullname

from jagadamba.jagadamba.pricing import calculate_quotation_costing
from jagadamba.jagadamba.type_settings import sync_type_settings


def before_insert(doc, _method=None):
	_auto_set_revision_number(doc)
	_fix_quotation_to_from_lead(doc)
	_copy_type_fields_from_opportunity(doc)


def validate(doc, _method=None):
	sync_type_settings(doc)
	calculate_quotation_costing(doc)


def _copy_type_fields_from_opportunity(doc):
	"""When a Quotation is created from an Opportunity, carry Type / Vehicle Type
	/ Finished Item across if they aren't already set on the Quotation."""
	if not doc.get("opportunity"):
		return

	opp = frappe.db.get_value(
		"Opportunity",
		doc.opportunity,
		["custom_types", "custom_vehicle_type", "custom_finished_item"],
		as_dict=True,
	)
	if not opp:
		return
	if doc.get("custom_types") and opp.custom_types and doc.custom_types != opp.custom_types:
		return

	if not doc.get("custom_types") and opp.custom_types:
		doc.custom_types = opp.custom_types
	if not doc.get("custom_vehicle_type") and opp.custom_vehicle_type:
		doc.custom_vehicle_type = opp.custom_vehicle_type
	# Opportunity uses `custom_finished_item`; Quotation uses `oil_gas_item`.
	if not doc.get("oil_gas_item") and opp.custom_finished_item:
		doc.oil_gas_item = opp.custom_finished_item


def _fix_quotation_to_from_lead(doc):
	if doc.quotation_to != "Lead" or not doc.party_name:
		return
	customer = frappe.db.get_value("Lead", doc.party_name, "custom_customers")
	if customer:
		doc.quotation_to = "Customer"
		doc.party_name = customer


def on_submit(doc, _method=None):
	_append_revision_history(doc, auto=True)


def _auto_set_revision_number(doc):
	if not doc.amended_from:
		return
	prev_rev = frappe.db.get_value("Quotation", doc.amended_from, "revision_number") or ""
	doc.revision_number = _next_revision(prev_rev)


def _next_revision(prev_rev):
	match = re.search(r"\d+", prev_rev or "")
	return "Rev {:02d}".format(int(match.group()) + 1) if match else "Rev 01"


def _append_revision_history(doc, auto=False, note=""):
	rev = doc.revision_number or "Initial"
	user = get_fullname(frappe.session.user)
	status = getattr(doc, "quotation_workflow_status", None) or getattr(doc, "status", "") or ""
	suffix = " | {}".format(note) if note else (" | Auto-logged on submit" if auto else "")
	line = "{} | {} | {} | {}{}".format(rev, today(), user, status, suffix)

	existing = doc.get("revision_history") or ""
	new_value = (existing + "\n" + line).strip()
	doc.db_set("revision_history", new_value, update_modified=False)


@frappe.whitelist()
def log_revision_note(quotation, note):
	if not isinstance(note, str) or not note.strip():
		frappe.throw(frappe._("Enter a revision note."))
	doc = frappe.get_doc("Quotation", quotation, for_update=True)
	doc.check_permission("write")
	_append_revision_history(doc, note=note.strip())
	return True
