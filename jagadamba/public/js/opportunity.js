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

function prefill_from_lead(frm) {
	if (!frm.is_new()) return;
	if (frm.doc.opportunity_from !== "Lead" || !frm.doc.party_name) return;

	frappe.db.get_value(
		"Lead",
		frm.doc.party_name,
		["custom_types", "custom_vehicle_type", "oil_gas_item"],
		(r) => {
			if (!r) return;
			if (!frm.doc.custom_types && r.custom_types) {
				frm.set_value("custom_types", r.custom_types);
			}
			if (!frm.doc.custom_vehicle_type && r.custom_vehicle_type) {
				frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
			}
			// Lead uses `oil_gas_item`; Opportunity uses `custom_finished_item`.
			if (!frm.doc.custom_finished_item && r.oil_gas_item) {
				frm.set_value("custom_finished_item", r.oil_gas_item);
			}
		}
	);
}

frappe.ui.form.on("Opportunity", {
	refresh(frm) {
		set_vehicle_type_query(frm);
		set_finished_item_query(frm);
		prefill_from_lead(frm);
	},

	custom_types(frm) {
		frm.set_value("custom_vehicle_type", "");
		frm.set_value("custom_finished_item", "");
		set_vehicle_type_query(frm);
	},
});
