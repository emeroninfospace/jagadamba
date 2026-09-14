import re
import frappe
from frappe.utils import today, get_fullname


def before_insert(doc, _method=None):
	_auto_set_revision_number(doc)


def validate(doc, _method=None):
	_fetch_customer_from_enquiry(doc)


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


def _fetch_customer_from_enquiry(doc):
	if not doc.enquiry_reference:
		return

	if doc.party_name:
		return

	lead = frappe.db.get_value(
		"Lead",
		doc.enquiry_reference,
		["custom_customers", "lead_name", "company_name", "project_name"],
		as_dict=True,
	)
	if not lead:
		return

	if lead.custom_customers:
		doc.quotation_to = "Customer"
		doc.party_name = lead.custom_customers
	elif lead.company_name:
		doc.quotation_to = "Customer"
		doc.party_name = lead.company_name

	if lead.project_name and not doc.custom_project:
		doc.custom_project = lead.project_name


@frappe.whitelist()
def log_revision_note(quotation, note):
	doc = frappe.get_doc("Quotation", quotation)
	_append_revision_history(doc, note=note)
	return True


@frappe.whitelist()
def get_enquiry_details(enquiry_reference):
	if not enquiry_reference:
		return {}

	lead = frappe.db.get_value(
		"Lead",
		enquiry_reference,
		[
			"custom_customers",
			"company_name",
			"lead_name",
			"enquiry_number",
			"person_responsible",
			"required_completion_date",
			"project_name",
		],
		as_dict=True,
	)
	if not lead:
		return {}

	result = {
		"enquiry_number": lead.enquiry_number,
		"required_completion_date": lead.required_completion_date,
		"person_responsible": lead.person_responsible,
		"project_name": lead.project_name,
	}

	if lead.custom_customers:
		result["quotation_to"] = "Customer"
		result["party_name"] = lead.custom_customers
	elif lead.company_name:
		result["quotation_to"] = "Customer"
		result["party_name"] = lead.company_name

	return result
