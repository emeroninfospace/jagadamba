// Which desks a user sees is set by each Workspace's roles. This file only
// picks the desk a user lands on when they have no last-visited page yet.
const DEFAULT_WORKSPACE_BY_ROLE = [
	["Management", "Jagadamba"],
	["Sales Executive", "Sales Desk"],
	["Design Engineer", "Design"],
	["Project Engineer", "Project Desk"],
	["Production Engineer", "Production"],
	["Quality Engineer", "Quality Desk"],
	["Procurement Engineer", "Procurement Desk"],
	["Stores User", "Stores"],
	["Finance Manager", "Accounting Overview"],
	["HR Manager", "HR"],
	["HR User", "HR"],
	["Delivery Manager", "Logistics Desk"],
	["Delivery User", "Logistics Desk"],
	["Maintenance Manager", "Maintenance Desk"],
	["Maintenance User", "Maintenance Desk"],
];

frappe.after_ajax(() => {
	if (frappe.session.user === "Administrator" || localStorage.current_page) return;
	const match = DEFAULT_WORKSPACE_BY_ROLE.find(([role]) => frappe.user.has_role(role));
	if (match) {
		localStorage.current_page = match[1];
		localStorage.is_current_page_public = "true";
	}
});
