import json
from pathlib import Path

import frappe

DEFAULT_TYPES = ["Trailers", "Oil & Gas", "Trading"]
PROFILE = "Jagadamba Workspace Profile"
PROFILE_SEEDS = Path(__file__).with_name("workspace_profiles.json")


def after_install():
	_seed_types()
	sync_workspace_roles()
	sync_workspace_profiles()


def after_migrate():
	sync_workspace_roles()
	sync_workspace_profiles()


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


def sync_workspace_profiles():
	"""Create missing dashboard profiles from the shipped defaults; never overwrite edited profiles."""
	from jagadamba.workspace_config import roles_for

	if not frappe.db.exists("DocType", PROFILE):
		return
	for seed in json.loads(PROFILE_SEEDS.read_text()):
		if frappe.db.exists(PROFILE, seed["scope"]):
			continue
		doc = frappe.new_doc(PROFILE)
		doc.update({key: value for key, value in seed.items() if key not in ("sources", "landing_roles")})
		if doc.home_workspace and not frappe.db.exists("Workspace", doc.home_workspace):
			doc.home_workspace = None
		for role in roles_for(seed["scope"]):
			if frappe.db.exists("Role", role):
				doc.append("roles", {"role": role})
		for role in seed.get("landing_roles", []):
			if frappe.db.exists("Role", role):
				doc.append("landing_roles", {"role": role})
		for source in seed.get("sources", []):
			source = clean_source(source)
			if source:
				doc.append("sources", source)
		doc.insert(ignore_permissions=True)


def clean_source(source):
	"""Drop optional settings that this site's DocTypes do not support (e.g. HRMS not installed)."""
	doctype = source["source_doctype"]
	if not frappe.db.exists("DocType", doctype):
		return None
	meta = frappe.get_meta(doctype)

	def known(fieldname):
		return fieldname in {"name", "creation", "modified", "docstatus"} or meta.has_field(fieldname)

	if not known(source["date_field"]):
		return None
	if source.get("extra_filters") and not all(known(key) for key in json.loads(source["extra_filters"])):
		return None
	source = dict(source)
	for fieldname in ("status_field", "party_field", "amount_field", "secondary_amount_field"):
		if source.get(fieldname) and not known(source[fieldname]):
			source.pop(fieldname)
	if source.get("alert_filters") and not all(known(key) for key in json.loads(source["alert_filters"])):
		source.pop("alert_filters")
		source.pop("alert_label", None)
	return source
