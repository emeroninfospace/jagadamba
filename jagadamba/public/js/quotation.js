frappe.ui.form.on("Quotation", {
	refresh: async function (frm) {
		await jagadamba.sales_flow.configure(frm, true);

		frm.set_query("custom_vehicle_type", function () {
			const filters = jagadamba.sales_flow.item_filters(frm, true);
			return { filters: filters };
		});

		frm.set_query("oil_gas_item", function () {
			const filters = jagadamba.sales_flow.item_filters(frm, true);
			return { filters: filters };
		});

		// Items table — restrict by the selected Type and Company
		frm.set_query("item_code", "items", function () {
			const filters = { disabled: 0 };
			if (frm.doc.custom_types) filters.custom_types = frm.doc.custom_types;
			if (frm.doc.company) filters.custom_company = frm.doc.company;
			return { filters: filters };
		});

		frm.set_query("item_code", "custom_additional_items", function (doc, cdt, cdn) {
			const row = locals[cdt][cdn];
			const filters = { disabled: 0 };
			if (row.item_group) filters.item_group = row.item_group;
			if (frm.doc.custom_types) filters.custom_types = frm.doc.custom_types;
			if (frm.doc.company) filters.custom_company = frm.doc.company;
			return { filters: filters };
		});

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
		if (frm.is_new()) await recalc_oil_gas_pricing(frm);
		jagadamba.sales_flow.render_statement(frm);

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
		await jagadamba.sales_flow.configure(frm);
		return recalc_oil_gas_pricing(frm);
	},
	custom_sale_value_without_tax(frm) { recalc_oil_gas_pricing(frm); },
	custom_vat_percent(frm) { recalc_oil_gas_pricing(frm); },
	custom_tax_percent(frm) { recalc_oil_gas_pricing(frm); },
	net_total(frm) { return recalc_oil_gas_pricing(frm); },
	custom_estimation_cost_source(frm) { return recalc_oil_gas_pricing(frm); },
	custom_tax_basis(frm) { return recalc_oil_gas_pricing(frm); },

});

function recalc_oil_gas_pricing(frm) {
	return jagadamba.sales_flow.recalculate(frm);
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

frappe.ui.form.on("Quotation Estimation Item", {
	qty(frm) { return jagadamba.sales_flow.recalculate(frm); },
	rate(frm) { return jagadamba.sales_flow.recalculate(frm); },
	custom_estimation_items_add(frm) { return jagadamba.sales_flow.recalculate(frm); },
	custom_estimation_items_remove(frm) { return jagadamba.sales_flow.recalculate(frm); },
});
