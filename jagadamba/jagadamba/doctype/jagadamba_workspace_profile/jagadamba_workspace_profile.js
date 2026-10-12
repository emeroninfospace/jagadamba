// Dashboard sections are configured here; numbers are always filtered by each user's permissions.
frappe.ui.form.on("Jagadamba Workspace Profile", {
	refresh(frm) {
		if (frm.doc.home_workspace) {
			frm.add_custom_button(__("Open Workspace"), () => frappe.set_route(frappe.router.slug(frm.doc.home_workspace)));
		}
	},
});
