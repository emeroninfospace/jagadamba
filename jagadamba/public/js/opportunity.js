function set_vehicle_type_query(frm) {
	frm.set_query("custom_vehicle_type", function () {
		const filters = { disabled: 0, item_group: "Finished Items" };
		if (frm.doc.custom_types) filters.custom_types = frm.doc.custom_types;
		if (frm.doc.company) filters.custom_company = frm.doc.company;
		return { filters: filters };
	});
}

function set_finished_item_query(frm) {
	frm.set_query("custom_finished_item", function () {
		const filters = { item_group: "Finished Items", disabled: 0, custom_types: "Oil & Gas" };
		if (frm.doc.company) filters.custom_company = frm.doc.company;
		return { filters: filters };
	});
}

function prefill_from_lead(frm) {
	return jagadamba.sales_flow.copy_from_source(frm, {
		doctype: "Lead", link_field: "party_name", only_new: true,
		guard: () => frm.doc.opportunity_from === "Lead",
		fields: { custom_types: "custom_types", custom_vehicle_type: "custom_vehicle_type",
			custom_finished_item: "oil_gas_item" },
	});
}

frappe.ui.form.on("Opportunity", {
	refresh(frm) {
		set_vehicle_type_query(frm);
		set_finished_item_query(frm);
		return prefill_from_lead(frm);
	},

	party_name(frm) { return prefill_from_lead(frm); },
	opportunity_from(frm) { return prefill_from_lead(frm); },

	custom_types(frm) {
		return jagadamba.sales_flow.clear_type_items(frm, ["custom_vehicle_type", "custom_finished_item"]);
	},
});
