import frappe


def validate(doc, method):
	_fetch_customer_from_enquiry(doc)


def _fetch_customer_from_enquiry(doc):
	if not doc.enquiry_reference:
		return

	if doc.party_name:
		return

	lead = frappe.db.get_value(
		"Lead",
		doc.enquiry_reference,
		["custom_customers", "lead_name", "company_name"],
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
		],
		as_dict=True,
	)
	if not lead:
		return {}

	result = {
		"enquiry_number": lead.enquiry_number,
		"required_completion_date": lead.required_completion_date,
		"person_responsible": lead.person_responsible,
	}

	if lead.custom_customers:
		result["quotation_to"] = "Customer"
		result["party_name"] = lead.custom_customers
	elif lead.company_name:
		result["quotation_to"] = "Customer"
		result["party_name"] = lead.company_name

	return result
