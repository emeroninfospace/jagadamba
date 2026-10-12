import frappe


DEFAULT_TYPES = ["Trailers", "Oil & Gas", "Trading"]


def after_install():
	_seed_types()


def _seed_types():
	for type_name in DEFAULT_TYPES:
		if frappe.db.exists("Type", type_name):
			continue
		doc = frappe.new_doc("Type")
		doc.type = type_name
		doc.insert(ignore_permissions=True)
	frappe.db.commit()
