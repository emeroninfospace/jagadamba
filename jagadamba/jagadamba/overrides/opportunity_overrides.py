import frappe


def before_insert(doc, method=None):
	if doc.opportunity_from != "Lead" or not doc.party_name:
		return

	lead = frappe.db.get_value(
		"Lead",
		doc.party_name,
		["custom_types", "custom_vehicle_type", "oil_gas_item"],
		as_dict=True,
	)
	if not lead:
		return
	if doc.get("custom_types") and lead.custom_types and doc.custom_types != lead.custom_types:
		return

	if not doc.get("custom_types") and lead.custom_types:
		doc.custom_types = lead.custom_types
	if not doc.get("custom_vehicle_type") and lead.custom_vehicle_type:
		doc.custom_vehicle_type = lead.custom_vehicle_type
	if not doc.get("custom_finished_item") and lead.oil_gas_item:
		doc.custom_finished_item = lead.oil_gas_item
