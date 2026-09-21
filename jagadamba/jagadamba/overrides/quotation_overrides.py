import re
import frappe
from frappe.utils import today, get_fullname


def before_insert(doc, _method=None):
	_auto_set_revision_number(doc)
	_fix_quotation_to_from_lead(doc)


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

	existing = frappe.db.get_value("Quotation", doc.name, "revision_history") or ""
	new_value = (existing + "\n" + line).strip()
	doc.db_set("revision_history", new_value, update_modified=False)


@frappe.whitelist()
def log_revision_note(quotation, note):
	doc = frappe.get_doc("Quotation", quotation)
	_append_revision_history(doc, note=note)
	return True


