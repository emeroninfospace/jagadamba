// Opportunities are not created from a Prospect.
frappe.ui.form.on("Prospect", {
	refresh(frm) {
		frm.remove_custom_button("Opportunity", "Create");
	},
});
