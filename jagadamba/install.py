import json
from pathlib import Path

import frappe

DEFAULT_TYPES = ["Trailers", "Oil & Gas", "Trading"]
PROFILE = "Jagadamba Workspace Profile"
PROFILE_SEEDS = Path(__file__).with_name("workspace_profiles.json")
CHILD_TABLES = ("sources", "landing_roles", "kpis", "series")


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
			add_missing_overview(seed)
			continue
		doc = frappe.new_doc(PROFILE)
		doc.update({key: value for key, value in seed.items() if key not in CHILD_TABLES})
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
		append_overview_rows(doc, seed)
		doc.insert(ignore_permissions=True)


def append_overview_rows(doc, seed):
	for table in ("kpis", "series"):
		for row in seed.get(table, []):
			row = clean_source(row)
			if row:
				doc.append(table, row)


def add_missing_overview(seed):
	"""Give an existing profile the shipped snapshot cards and chart once, if it has none yet."""
	if not (seed.get("kpis") or seed.get("series")):
		return
	doc = frappe.get_doc(PROFILE, seed["scope"])
	if doc.get("kpis") or doc.get("series"):
		return
	for key in ("layout", "comparison_title", "difference_label"):
		if seed.get(key) and not doc.get(key):
			doc.set(key, seed[key])
	append_overview_rows(doc, seed)
	doc.save(ignore_permissions=True)


def clean_source(source):
	"""Drop optional settings that this site's DocTypes do not support (e.g. HRMS not installed)."""
	doctype = source["source_doctype"]
	if not frappe.db.exists("DocType", doctype):
		return None
	meta = frappe.get_meta(doctype)

	def known(fieldname):
		return fieldname in {"name", "creation", "modified", "docstatus"} or meta.has_field(fieldname)

	if source.get("date_field") and not known(source["date_field"]):
		return None
	for fieldname in ("extra_filters", "filters"):
		if source.get(fieldname) and not all(known(key) for key in json.loads(source[fieldname])):
			return None
	source = dict(source)
	if source.get("value_field") and not known(source["value_field"]):
		return None
	if source.get("secondary_filters") and not all(known(key) for key in json.loads(source["secondary_filters"])):
		source.pop("secondary_filters")
	for fieldname in ("status_field", "party_field", "amount_field", "secondary_amount_field"):
		if source.get(fieldname) and not known(source[fieldname]):
			source.pop(fieldname)
	if source.get("alert_filters") and not all(known(key) for key in json.loads(source["alert_filters"])):
		source.pop("alert_filters")
		source.pop("alert_label", None)
	return source
