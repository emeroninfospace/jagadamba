"""Type-driven form behavior shared by the sales documents."""
import frappe
from frappe.utils import cint


TYPE_FIELDS = (
	"enable_estimation", "show_additional_items", "show_vehicle_item",
	"show_job_item", "show_project_details", "finished_item_group",
)
SALES_DOCTYPES = ("Lead", "Opportunity", "Quotation", "Sales Order")


def default_finished_item_group():
	return frappe.db.get_single_value("Jagadamba Settings", "default_finished_item_group") or ""


def get_configuration(type_name):
	if not type_name:
		config = {key: 0 for key in TYPE_FIELDS}
		config["finished_item_group"] = default_finished_item_group()
		return config
	doc = frappe.get_cached_doc("Type", type_name)
	config = {key: cint(doc.get(key)) for key in TYPE_FIELDS if key != "finished_item_group"}
	config["finished_item_group"] = doc.get("finished_item_group") or default_finished_item_group()
	return config


@frappe.whitelist()
def get_type_settings(type_name=None):
	# Configuration contains only form behavior, no transaction or pricing data.
	if not any(frappe.has_permission(dt, "read") for dt in SALES_DOCTYPES):
		frappe.throw(frappe._("Not permitted to access sales configuration."), frappe.PermissionError)
	return get_configuration(type_name)


def sync_type_settings(doc, method=None):
	for key, value in get_configuration(doc.get("custom_types")).items():
		doc.set("custom_" + key, value)


@frappe.whitelist()
def finished_item_query(doctype, txt, searchfield, start, page_len, filters):
	"""Link search for Job Item / Vehicle Type style fields: enabled finished items of the
	document's Type. The finished item group (and its sub-groups) is resolved here, so the
	filter never depends on form scripts having loaded the Type settings first."""
	filters = frappe._dict(filters or {})
	type_name = filters.get("type") or None
	if type_name and not frappe.db.exists("Type", type_name):
		type_name = None
	conditions = {"disabled": 0}
	if type_name:
		conditions["custom_types"] = type_name
	if filters.get("company"):
		conditions["custom_company"] = filters.company
	if cint(filters.get("parent_item")):
		conditions["custom_parent_item"] = 1
	group = get_configuration(type_name)["finished_item_group"]
	if group:
		conditions["item_group"] = ["descendants of (inclusive)", group]
	txt = "%{}%".format(txt or "")
	return frappe.get_list(
		"Item",
		filters=conditions,
		or_filters={"name": ["like", txt], "item_name": ["like", txt]},
		fields=["name", "item_name"],
		order_by="name",
		limit_start=cint(start),
		limit_page_length=cint(page_len) or 20,
		as_list=True,
	)
