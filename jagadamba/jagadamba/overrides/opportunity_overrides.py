import frappe


def before_insert(doc, method=None):
	"""When an Opportunity is created from a Lead, copy Type and Vehicle Type
	from the source Lead if they aren't already set on the Opportunity."""
	if doc.opportunity_from != "Lead" or not doc.party_name:
		return

	lead = frappe.db.get_value(
		"Lead",
		doc.party_name,
		["custom_types", "custom_vehicle_type"],
		as_dict=True,
	)
	if not lead:
		return

	if not doc.get("custom_types") and lead.custom_types:
		doc.custom_types = lead.custom_types
	if not doc.get("custom_vehicle_type") and lead.custom_vehicle_type:
		doc.custom_vehicle_type = lead.custom_vehicle_type
