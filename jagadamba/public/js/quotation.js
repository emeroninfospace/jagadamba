frappe.ui.form.on("Quotation", {
	refresh: async function (frm) {
		// frm.set_query("item_code", "items", function () {
		// 	return { filters: { custom_parent_item: 1, disabled: 0 } };
		// });

		frm.set_query("custom_vehicle_type", function () {
			const filters = { disabled: 0, item_group: "Finished Items" };
			if (frm.doc.custom_types) filters.custom_types = frm.doc.custom_types;
			if (frm.doc.company) filters.custom_company = frm.doc.company;
			return { filters: filters };
		});

		frm.set_query("oil_gas_item", function () {
			const filters = { item_group: "Finished Items", disabled: 0, custom_types: "Oil & Gas" };
			if (frm.doc.company) filters.custom_company = frm.doc.company;
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

		toggle_trading_fields(frm);

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

	custom_types: function (frm) {
		jagadamba.sales_flow.clear_type_items(frm, ["custom_vehicle_type", "oil_gas_item"]);
		recalc_oil_gas_pricing(frm);
		toggle_trading_fields(frm);
	},
	custom_sale_value_without_tax(frm) { recalc_oil_gas_pricing(frm); },
	custom_vat_percent(frm) { recalc_oil_gas_pricing(frm); },
	custom_tax_percent(frm) { recalc_oil_gas_pricing(frm); },
	net_total(frm) { recalc_oil_gas_pricing(frm); },

});

function toggle_trading_fields(frm) {
	// For Trading, hide Project, Estimator and Revision Number
	const is_trading = frm.doc.custom_types === "Trading";
	["custom_project", "estimator", "revision_number"].forEach((f) => {
		if (frm.get_field(f)) frm.toggle_display(f, !is_trading);
	});
}

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

// frappe.ui.form.on("Quotation Item", {
// 	before_remove: function (frm, cdt, cdn) {
// 		let row = locals[cdt][cdn];
// 		if (!row.item_code) return;
// 		let to_remove = (frm.doc.custom_item_groups || []).filter(
// 			(i) => i.parent_item === row.item_code
// 		);
// 		to_remove.forEach((i) => frappe.model.clear_doc(i.doctype, i.name));
// 		frm.doc.custom_item_groups = (frm.doc.custom_item_groups || []).filter(
// 			(i) => i.parent_item !== row.item_code
// 		);
// 		frm.refresh_field("custom_item_groups");
// 	},
//
// 	item_code: function (frm, cdt, cdn) {
// 		let row = locals[cdt][cdn];
//
// 		let current_parents = new Set(
// 			(frm.doc.items || []).map((i) => i.item_code).filter(Boolean)
// 		);
// 		let stale = (frm.doc.custom_item_groups || []).filter(
// 			(i) => i.parent_item && !current_parents.has(i.parent_item)
// 		);
// 		stale.forEach((i) => frappe.model.clear_doc(i.doctype, i.name));
// 		frm.doc.custom_item_groups = (frm.doc.custom_item_groups || []).filter(
// 			(i) => !i.parent_item || current_parents.has(i.parent_item)
// 		);
// 		frm.refresh_field("custom_item_groups");
//
// 		if (!row.item_code) return;
//
// 		frappe.dom.freeze(__("Fetching build category items..."));
// 		frappe.call({
// 			method: "jagadamba.jagadamba.api.get_child_items_for_parent_items",
// 			args: { parent_item_codes: JSON.stringify([row.item_code]) },
// 			callback: function (r) {
// 				frappe.dom.unfreeze();
// 				if (!r.message || !r.message.length) return;
//
// 				let added = 0;
// 				r.message.forEach((item) => {
// 					let exists = (frm.doc.custom_item_groups || []).some(
// 						(i) => i.item_code === item.item_code
// 					);
// 					if (!exists) {
// 						let child = frm.add_child("custom_item_groups");
// 						child.parent_item = item.parent_item;
// 						child.item_code = item.item_code;
// 						child.item_name = item.item_name;
// 						child.uom = item.uom;
// 						child.item_group = item.item_group;
// 						child.description = item.description;
// 						added++;
// 					}
// 				});
// 				frm.refresh_field("custom_item_groups");
// 				if (added) {
// 					frappe.show_alert({
// 						message: __("{0} item(s) added to Build Categories", [added]),
// 						indicator: "green",
// 					});
// 				}
// 			},
// 		});
// 	},
// });

function prefill_quotation_type(frm) {
	return jagadamba.sales_flow.copy_from_source(frm, {
		doctype: "Opportunity", link_field: "opportunity", only_new: true,
		fields: { custom_types: "custom_types", custom_vehicle_type: "custom_vehicle_type",
			oil_gas_item: "custom_finished_item" },
	});
}
