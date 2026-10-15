"""The design team attaches drawings to the Project and builds its BOM, so Design Engineers need
to open and update Projects."""
import frappe
from frappe.permissions import add_permission, update_permission_property

ROLE = "Design Engineer"
RIGHTS = ("read", "write", "report", "print", "export")


def execute():
	if not frappe.db.exists("Role", ROLE):
		return
	add_permission("Project", ROLE, 0)
	for right in RIGHTS:
		update_permission_property("Project", ROLE, 0, right, 1, validate=False)
