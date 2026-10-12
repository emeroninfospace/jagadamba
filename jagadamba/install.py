import frappe


DEFAULT_TYPES = ["Trailers", "Oil & Gas", "Trading"]


def after_install():
	_seed_types()
	sync_workspace_roles()


def _seed_types():
	for type_name in DEFAULT_TYPES:
		if frappe.db.exists("Type", type_name):
			continue
		doc = frappe.new_doc("Type")
		doc.type = type_name
		doc.insert(ignore_permissions=True)



def sync_workspace_roles():
	"""Upgrade previously unrestricted app workspaces without overwriting custom roles."""
	from jagadamba.workspace_config import WORKSPACES, roles_for

	for name, scope in WORKSPACES.items():
		if not frappe.db.exists("Workspace", name):
			continue
		doc = frappe.get_doc("Workspace", name)
		if doc.module != "Jagadamba" or doc.roles:
			continue
		for role in roles_for(scope):
			if frappe.db.exists("Role", role):
				doc.append("roles", {"role": role})
		doc.save(ignore_permissions=True)
