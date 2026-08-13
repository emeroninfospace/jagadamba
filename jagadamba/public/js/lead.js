frappe.ui.form.on("Lead", {
	refresh: function (frm) {
		setTimeout(() => {
			frm.remove_custom_button("Prospect", "Create");
			frm.remove_custom_button("Add to Prospect", "Action");
		}, 100);
	},
});
