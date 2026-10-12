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
		return prefill_from_lead(frm);
	},

	party_name(frm) { return prefill_from_lead(frm); },
	opportunity_from(frm) { return prefill_from_lead(frm); },

	async custom_types(frm) {
		await jagadamba.sales_flow.clear_type_items(frm, ["custom_vehicle_type", "custom_finished_item"]);
		await jagadamba.sales_flow.configure(frm);
	},
});
