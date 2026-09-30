function set_vehicle_type_query(frm) {
	frm.set_query("custom_vehicle_type", function () {
		const filters = { custom_parent_item: 1, disabled: 0, item_group: "Finished Items" };
		if (frm.doc.custom_types) {
			filters.custom_types = frm.doc.custom_types;
		}
		return { filters: filters };
	});
}

frappe.ui.form.on("Opportunity", {
	refresh(frm) {
		set_vehicle_type_query(frm);
	},

	custom_types(frm) {
		frm.set_value("custom_vehicle_type", "");
		set_vehicle_type_query(frm);
	},
});
