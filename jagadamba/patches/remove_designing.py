"""The design team works from Project and BOM, so the Designing doctype is retired.

Removing the doctype files from the app does not delete them on a site, so this drops the
doctypes and their desk cards and chart. Sites that still hold Designing records are left alone."""
import frappe

DOCTYPES = ("Designing", "Designing Attachment", "Designing Raw Material")
NUMBER_CARDS = ("Designs In Progress", "Designs Awaiting Customer")
CHARTS = ("Designing by Status",)


def execute():
	if frappe.db.table_exists("Designing") and frappe.db.count("Designing"):
		return
	for name in NUMBER_CARDS:
		frappe.delete_doc("Number Card", name, ignore_missing=True, force=True)
	for name in CHARTS:
		frappe.delete_doc("Dashboard Chart", name, ignore_missing=True, force=True)
	for name in DOCTYPES:
		frappe.delete_doc("DocType", name, ignore_missing=True, force=True)
