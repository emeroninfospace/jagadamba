import frappe


def get_cost_center_for_type(type_name):
	if not type_name:
		return None
	settings = frappe.get_cached_doc("Jagadamba Settings")
	for row in settings.jagadamba_type_cost_center or []:
		if row.type == type_name:
			return row.cost_center
	return None


@frappe.whitelist()
def get_cost_center(type_name):
	return get_cost_center_for_type(type_name)


def _apply_cost_center(doc, cost_center):
	if not cost_center:
		return
	if doc.meta.has_field("cost_center") and not doc.cost_center:
		doc.cost_center = cost_center
	for item in doc.get("items") or []:
		if item.meta.has_field("cost_center") and not item.cost_center:
			item.cost_center = cost_center


def set_cost_center_from_type(doc, method=None):
	type_name = getattr(doc, "custom_types", None)
	if not type_name:
		return
	cost_center = get_cost_center_for_type(type_name)
	_apply_cost_center(doc, cost_center)
