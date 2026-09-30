function set_vehicle_type_query(frm) {
	frm.set_query("custom_vehicle_type", function () {
		const filters = { custom_parent_item: 1, disabled: 0, item_group: "Finished Items" };
		if (frm.doc.custom_types && frm.doc.custom_types !== "Oil & Gas") {
			filters.custom_types = frm.doc.custom_types;
		}
		return { filters: filters };
	});
}

function set_finished_item_query(frm) {
	frm.set_query("custom_finished_item", function () {
		return { filters: { item_group: "Finished Items", disabled: 0, custom_types: "Oil & Gas" } };
	});
}

frappe.ui.form.on("Opportunity", {
	refresh(frm) {
		set_vehicle_type_query(frm);
		set_finished_item_query(frm);
	},

	custom_types(frm) {
		frm.set_value("custom_vehicle_type", "");
		frm.set_value("custom_finished_item", "");
		set_vehicle_type_query(frm);
	},
});
