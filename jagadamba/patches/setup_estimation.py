"""One-time defaults for existing types; later administrator changes are preserved."""
import frappe

from jagadamba.jagadamba.type_settings import SALES_DOCTYPES, get_configuration


MARKER = "jagadamba.setup_dynamic_estimation_v1"
COST_CODE_MARKER = "jagadamba.setup_estimation_cost_codes_v1"
REMOVE_QUOTATION_ESTIMATION_MARKER = "jagadamba.remove_quotation_estimation_v1"
FORM_CLEANUP_MARKER = "jagadamba.form_cleanup_v1"
QUOTATION_COSTING_MARKER = "jagadamba.enable_quotation_costing_v1"
# Types that quote manufactured jobs and get the Quotation Costing sheet on first migrate.
COSTING_TYPES = ("Oil & Gas",)
# Unused or empty layout fields; dropping them from the fixtures does not delete them on a site.
REMOVED_LAYOUT_FIELDS = (
	("Quotation", "custom_column_break_fqddl"), ("Quotation", "custom_column_break_gmu0q"),
	("Quotation", "custom_column_break_w0z8d"), ("Quotation", "custom_column_break_jwxq5"),
	("Quotation", "custom_estimation_tab"), ("Quotation", "custom_estimation_statement_section"),
	("Quotation", "custom_estimation_statement"), ("Quotation", "custom_item_groups"),
	("Sales Order", "custom_column_break_zo0jd"), ("Sales Order", "custom_column_break_7ozif"),
	("Sales Order", "custom_column_break_flwaf"), ("Sales Order", "custom_column_break_unsqa"),
	("Sales Order", "custom_item_groups"), ("Sales Order", "custom_estimation_cost_source"),
	("Lead", "custom_column_break_ddhxm"),
)
# The Costing sheet brought the pricing fields back to Quotation under their old names, so only
# the old estimation table is removed; deleting the others would drop the new fields on a fresh site.
REMOVED_QUOTATION_FIELDS = (
	"custom_estimation_section", "custom_estimation_cost_source", "custom_estimation_items",
)


def execute():
	_setup_type_configuration()
	_setup_finished_item_default()
	_remove_quotation_estimation()
	_remove_layout_fields()
	_enable_quotation_costing()


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
		config = {"custom_" + key: value for key, value in get_configuration(name).items()}
		for dt in SALES_DOCTYPES:
			meta = frappe.get_meta(dt)
			values = {key: value for key, value in config.items() if meta.has_field(key)}
			# Metadata only; no submitted financial amounts or existing child rows are rewritten.
			if values:
				frappe.db.set_value(dt, {"custom_types": name}, values, update_modified=False)
	frappe.get_doc({"doctype": "Patch Log", "patch": MARKER}).insert(ignore_permissions=True)


def _setup_finished_item_default():
	if frappe.db.exists("Patch Log", {"patch": COST_CODE_MARKER}):
		return
	# One-time default; administrators change it in Jagadamba Settings afterwards.
	if not frappe.db.get_single_value("Jagadamba Settings", "default_finished_item_group") \
		and frappe.db.exists("Item Group", "Finished Items"):
		frappe.db.set_single_value("Jagadamba Settings", "default_finished_item_group", "Finished Items")
	frappe.get_doc({"doctype": "Patch Log", "patch": COST_CODE_MARKER}).insert(ignore_permissions=True)


def _remove_quotation_estimation():
	"""Removes the old Quotation estimation table. Fixture sync never deletes custom fields,
	so remove them here; stored column values and child rows are left in place."""
	if frappe.db.exists("Patch Log", {"patch": REMOVE_QUOTATION_ESTIMATION_MARKER}):
		return
	for fieldname in REMOVED_QUOTATION_FIELDS:
		name = "Quotation-" + fieldname
		if frappe.db.exists("Custom Field", name):
			frappe.delete_doc("Custom Field", name, ignore_permissions=True, force=True)
	# The cost-code master only served the Quotation estimate.
	if frappe.db.exists("DocType", "Estimation Cost Code"):
		frappe.delete_doc("DocType", "Estimation Cost Code", ignore_permissions=True, force=True)
	frappe.clear_cache(doctype="Quotation")
	frappe.get_doc({"doctype": "Patch Log", "patch": REMOVE_QUOTATION_ESTIMATION_MARKER}).insert(ignore_permissions=True)


def _remove_layout_fields():
	"""Removes empty column breaks and unused hidden fields; stored column values stay."""
	if frappe.db.exists("Patch Log", {"patch": FORM_CLEANUP_MARKER}):
		return
	for doctype, fieldname in REMOVED_LAYOUT_FIELDS:
		name = doctype + "-" + fieldname
		if frappe.db.exists("Custom Field", name):
			frappe.delete_doc("Custom Field", name, ignore_permissions=True, force=True)
	for doctype in {doctype for doctype, _ in REMOVED_LAYOUT_FIELDS}:
		frappe.clear_cache(doctype=doctype)
	frappe.get_doc({"doctype": "Patch Log", "patch": FORM_CLEANUP_MARKER}).insert(ignore_permissions=True)


def _enable_quotation_costing():
	"""The Costing sheet follows the Type's Enable Costing and Pricing flag. Tick it once for the
	job-quoting types so the sheet appears after upgrading; administrators can untick it later."""
	if frappe.db.exists("Patch Log", {"patch": QUOTATION_COSTING_MARKER}):
		return
	for name in COSTING_TYPES:
		if frappe.db.exists("Type", name):
			frappe.db.set_value("Type", name, "enable_estimation", 1, update_modified=False)
			frappe.clear_document_cache("Type", name)
	frappe.get_doc({"doctype": "Patch Log", "patch": QUOTATION_COSTING_MARKER}).insert(ignore_permissions=True)
