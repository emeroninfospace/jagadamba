frappe.ui.form.on("Quotation", {
	// Queries are registered before any awaited lookup so they always apply.
	setup: function (frm) {
		// Items table — restrict by the selected Type and Company
		frm.set_query("item_code", "items", function () {
			return { filters: jagadamba.sales_flow.item_filters(frm) };
		});

		// Additional Items list the row's Item Group (and its sub-groups) only, regardless of Type.
		frm.set_query("item_code", "custom_additional_items", function (doc, cdt, cdn) {
			const row = locals[cdt][cdn];
			const filters = { disabled: 0 };
			if (row.item_group) filters.item_group = ["descendants of (inclusive)", row.item_group];
			return { filters: filters };
		});
	},

	refresh: async function (frm) {
		await jagadamba.sales_flow.configure(frm, true);

		if (frm.is_new() && frm.doc.quotation_to === "Lead" && frm.doc.party_name) {
			const doc = frm.doc;
			const lead = doc.party_name;
			const response = await frappe.db.get_value("Lead", lead, "custom_customers");
			if (frm.doc === doc && frm.is_new() && doc.quotation_to === "Lead"
				&& doc.party_name === lead && response.message?.custom_customers) {
				await frm.set_value({quotation_to: "Customer", party_name: response.message.custom_customers});
			}
		}
		await prefill_quotation_type(frm);

		if (!frm.is_new()) {
			frm.add_custom_button(__("Log Revision Note"), function () {
				frappe.prompt(
					{ fieldtype: "Small Text", fieldname: "note", label: __("Revision Note"), reqd: 1 },
					function (values) {
						frappe.call({
							method: "jagadamba.jagadamba.overrides.quotation_overrides.log_revision_note",
							args: { quotation: frm.doc.name, note: values.note },
							callback: function () {
								frm.reload_doc();
								frappe.show_alert({ message: __("Revision note logged"), indicator: "green" });
							},
						});
					},
					__("Log Revision Note"),
					__("Save")
				);
			}, __("Actions"));
		}
	},

	opportunity(frm) { return prefill_quotation_type(frm); },

	custom_types: async function (frm) {
		await jagadamba.sales_flow.clear_type_items(frm, ["custom_vehicle_type", "oil_gas_item"]);
		return jagadamba.sales_flow.configure(frm);
	},
});
frappe.ui.form.on("Quotation Cost Estimate", {
    qty: (frm, cdt, cdn) => calc_row(frm, cdt, cdn),
    rate: (frm, cdt, cdn) => calc_row(frm, cdt, cdn),
    custom_costing_remove: (frm) => calc_totals(frm),
});
 function calc_row(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    frappe.model.set_value(cdt, cdn, "amount", flt(row.qty) * flt(row.rate));
    calc_totals(frm);
}
 
function calc_totals(frm) {
    const estimated = (frm.doc.custom_costing || [])
        .reduce((sum, r) => sum + flt(r.amount), 0);
    const sale = flt(frm.doc.total);
 
    frm.set_value("custom_total_estimated_value", estimated);
    frm.set_value("custom_net_profit", sale - estimated);
   
}

frappe.ui.form.on("Quotation Additional Item", {
	item_group(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (row.item_code) {
			frappe.model.set_value(cdt, cdn, "item_code", "");
			frappe.model.set_value(cdt, cdn, "item_name", "");
			frappe.model.set_value(cdt, cdn, "description", "");
		}
	},
});

function prefill_quotation_type(frm) {
	return jagadamba.sales_flow.copy_from_source(frm, {
		doctype: "Opportunity", link_field: "opportunity", only_new: true,
		fields: { custom_types: "custom_types", custom_vehicle_type: "custom_vehicle_type",
			oil_gas_item: "custom_finished_item" },
	});
}
