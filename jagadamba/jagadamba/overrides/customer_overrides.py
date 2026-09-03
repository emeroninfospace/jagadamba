import frappe
from frappe.model.naming import make_autoname


def before_insert(doc, method):
	if not doc.customer_number:
		doc.customer_number = make_autoname("CUST-.YYYY.-.#####")
