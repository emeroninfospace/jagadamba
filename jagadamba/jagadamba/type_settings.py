"""Type-driven form behavior shared by the sales documents."""
import frappe
from frappe.utils import cint


TYPE_FIELDS = (
	"enable_estimation", "show_additional_items", "show_vehicle_item",
	"show_job_item", "show_project_details", "finished_item_group",
)
SALES_DOCTYPES = ("Lead", "Opportunity", "Quotation", "Sales Order")


def get_configuration(type_name):
	if not type_name:
		return {key: "" if key == "finished_item_group" else 0 for key in TYPE_FIELDS}
	doc = frappe.get_cached_doc("Type", type_name)
	return {key: (doc.get(key) or "") if key == "finished_item_group" else cint(doc.get(key))
		for key in TYPE_FIELDS}


@frappe.whitelist()
def get_type_settings(type_name=None):
	# Configuration contains only form behavior, no transaction or pricing data.
	if not any(frappe.has_permission(dt, "read") for dt in SALES_DOCTYPES):
		frappe.throw(frappe._("Not permitted to access sales configuration."), frappe.PermissionError)
	return get_configuration(type_name)


def sync_type_settings(doc, method=None):
	for key, value in get_configuration(doc.get("custom_types")).items():
		doc.set("custom_" + key, value)
