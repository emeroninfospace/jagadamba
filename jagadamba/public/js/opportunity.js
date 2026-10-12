function set_vehicle_type_query(frm) {
	frm.set_query("custom_vehicle_type", function () {
		const filters = jagadamba.sales_flow.item_filters(frm, true);
		return { filters: filters };
	});
}

function set_finished_item_query(frm) {
	frm.set_query("custom_finished_item", function () {
		const filters = jagadamba.sales_flow.item_filters(frm, true);
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
	async refresh(frm) {
		await jagadamba.sales_flow.configure(frm, true);
		set_vehicle_type_query(frm);
		set_finished_item_query(frm);
		return prefill_from_lead(frm);
	},

	party_name(frm) { return prefill_from_lead(frm); },
	opportunity_from(frm) { return prefill_from_lead(frm); },

	async custom_types(frm) {
		await jagadamba.sales_flow.clear_type_items(frm, ["custom_vehicle_type", "custom_finished_item"]);
		await jagadamba.sales_flow.configure(frm);
	},
});
