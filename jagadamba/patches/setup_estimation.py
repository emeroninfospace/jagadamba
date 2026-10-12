"""One-time defaults for existing types; later administrator changes are preserved."""
import frappe

from jagadamba.jagadamba.type_settings import SALES_DOCTYPES, get_configuration


MARKER = "jagadamba.setup_dynamic_estimation_v1"
COST_CODE_MARKER = "jagadamba.setup_estimation_cost_codes_v1"


def execute():
	_setup_type_configuration()
	_setup_cost_codes_and_defaults()


def _setup_type_configuration():
	if frappe.db.exists("Patch Log", {"patch": MARKER}):
		return
	# These are migration defaults for existing installations, not runtime name checks.
	defaults = {
		"Oil & Gas": {"enable_estimation": 1, "show_job_item": 1, "show_project_details": 1},
		"Trailers": {"show_additional_items": 1, "show_vehicle_item": 1, "show_project_details": 1},
		"Trading": {},
	}
	for name, values in defaults.items():
		if not frappe.db.exists("Type", name):
			continue
		if frappe.db.exists("Item Group", "Finished Items"):
			values["finished_item_group"] = "Finished Items"
		if values:
			frappe.db.set_value("Type", name, values, update_modified=False)
		frappe.clear_document_cache("Type", name)
	for name in frappe.get_all("Type", pluck="name"):
		values = {"custom_" + key: value for key, value in get_configuration(name).items()}
		for dt in SALES_DOCTYPES:
			# Metadata only; no submitted financial amounts or existing child rows are rewritten.
			frappe.db.set_value(dt, {"custom_types": name}, values, update_modified=False)
	frappe.get_doc({"doctype": "Patch Log", "patch": MARKER}).insert(ignore_permissions=True)


def _setup_cost_codes_and_defaults():
	"""Cost codes typed on earlier quotations become master records so the Link field keeps them valid."""
	if frappe.db.exists("Patch Log", {"patch": COST_CODE_MARKER}):
		return
	rows = frappe.get_all("Quotation Estimation Item", fields=["code", "description", "uom"],
		filters={"code": ["is", "set"]}, order_by="creation asc")
	for row in rows:
		code = (row.code or "").strip()
		if not code or frappe.db.exists("Estimation Cost Code", code):
			continue
		frappe.get_doc({"doctype": "Estimation Cost Code", "code": code,
			"description": row.description or code, "default_uom": row.uom}).insert(ignore_permissions=True)
	# One-time default; administrators change it in Jagadamba Settings afterwards.
	if not frappe.db.get_single_value("Jagadamba Settings", "default_finished_item_group") \
		and frappe.db.exists("Item Group", "Finished Items"):
		frappe.db.set_single_value("Jagadamba Settings", "default_finished_item_group", "Finished Items")
	frappe.get_doc({"doctype": "Patch Log", "patch": COST_CODE_MARKER}).insert(ignore_permissions=True)
