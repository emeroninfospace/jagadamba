"""Role-based landing workspace, resolved from Jagadamba Workspace Profile records."""
import frappe


def boot_session(bootinfo):
	user = bootinfo.get("user") or {}
	if frappe.session.user == "Guest" or not user.get("roles"):
		return
	from jagadamba.jagadamba.workspace_dashboard import home_profile

	profile = home_profile(user.get("roles"))
	if not profile:
		return
	allowed = {page.get("name") for page in (bootinfo.get("allowed_workspaces") or [])}
	if allowed and profile.home_workspace not in allowed:
		return
	workspace = frappe.db.get_value("Workspace", profile.home_workspace, ["name", "title", "public"], as_dict=True)
	if not workspace or not workspace.public:
		return
	bootinfo.jagadamba_home = {"name": workspace.name, "title": workspace.title, "scope": profile.name}
	# A Default Workspace chosen on the User record always wins.
	if not user.get("default_workspace"):
		user["default_workspace"] = {"name": workspace.name, "title": workspace.title, "public": 1}
