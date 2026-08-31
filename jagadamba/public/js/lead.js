frappe.ui.form.on("Lead", {
	refresh: function (frm) {
		frm.set_query("custom_vehicle_type", function () {
			return { filters: { custom_parent_item: 1, disabled: 0, item_group: "Finished Items" } };
		});

		setTimeout(() => {
			frm.remove_custom_button("Prospect", "Create");
			frm.remove_custom_button("Add to Prospect", "Action");
		}, 100);
	},
});
