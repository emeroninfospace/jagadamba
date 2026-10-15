"""Access the design team needs on top of its Design desk.

Design Engineers attach drawings to the Project and build its BOM, so they open and update
Projects. They also check stock while building BOMs, so they can run the stock reports on the
Design desk, which needs report access to each report's source doctype."""
import frappe
from frappe.permissions import add_permission, update_permission_property

ROLE = "Design Engineer"
DOCTYPE_RIGHTS = {
	"Project": ("read", "write", "report", "print", "export"),
	"Stock Ledger Entry": ("read", "report"),
	"Warehouse": ("read", "report"),
	"Item": ("read", "report"),
	"BOM": ("read", "report"),
}
REPORTS = (
	"Stock Balance", "Stock Ledger", "Stock Projected Qty", "Warehouse Wise Stock Balance",
	"Stock Ageing", "BOM Stock Report",
)


def execute():
	if not frappe.db.exists("Role", ROLE):
		return
	for doctype, rights in DOCTYPE_RIGHTS.items():
		add_permission(doctype, ROLE, 0)
		for right in rights:
			update_permission_property(doctype, ROLE, 0, right, 1, validate=False)
	for report in REPORTS:
		if frappe.db.exists("Report", report):
			allow_report(report)


def allow_report(report):
	# A Custom Role replaces the report's own roles, so it starts from them.
	name = frappe.db.get_value("Custom Role", {"report": report})
	if name:
		doc = frappe.get_doc("Custom Role", name)
	else:
		doc = frappe.new_doc("Custom Role")
		doc.report = report
		for role in frappe.get_all("Has Role", {"parent": report, "parenttype": "Report"}, pluck="role"):
			doc.append("roles", {"role": role})
	if ROLE not in {row.role for row in doc.roles}:
		doc.append("roles", {"role": ROLE})
	doc.save(ignore_permissions=True)
