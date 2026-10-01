frappe.ui.form.on("Quotation", {
	refresh: function (frm) {
		// frm.set_query("item_code", "items", function () {
		// 	return { filters: { custom_parent_item: 1, disabled: 0 } };
		// });

		frm.set_query("custom_vehicle_type", function () {
			let filters = { custom_parent_item: 1, disabled: 0, item_group: "Finished Items" };
			if (frm.doc.custom_types && frm.doc.custom_types !== "Oil & Gas") {
				filters.custom_types = frm.doc.custom_types;
			}
			return { filters: filters };
		});

		frm.set_query("oil_gas_item", function () {
			return { filters: { item_group: "Finished Items", disabled: 0, custom_types: "Oil & Gas" } };
		});

		frm.set_query("item_code", "custom_additional_items", function (doc, cdt, cdn) {
			const row = locals[cdt][cdn];
			const filters = { disabled: 0 };
			if (row.item_group) filters.item_group = row.item_group;
			return { filters: filters };
		});

		if (frm.is_new() && frm.doc.quotation_to === "Lead" && frm.doc.party_name) {
			frappe.db.get_value("Lead", frm.doc.party_name, "custom_customers", (r) => {
				if (r && r.custom_customers) {
					frm.set_value("quotation_to", "Customer");
					frm.set_value("party_name", r.custom_customers);
				}
			});
		}


		recalc_oil_gas_pricing(frm);

		if (frm.is_new() && frm.doc.opportunity) {
			frappe.db.get_value(
				"Opportunity",
				frm.doc.opportunity,
				["custom_types", "custom_vehicle_type", "custom_finished_item"],
				(r) => {
					if (!r) return;
					if (!frm.doc.custom_types && r.custom_types) {
						frm.set_value("custom_types", r.custom_types);
					}
					if (!frm.doc.custom_vehicle_type && r.custom_vehicle_type) {
						frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
					}
					if (!frm.doc.oil_gas_item && r.custom_finished_item) {
						frm.set_value("oil_gas_item", r.custom_finished_item);
					}
				}
			);
		}

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

	custom_types: function (frm) {
		frm.set_value("custom_vehicle_type", "");
		frm.set_value("oil_gas_item", "");
		recalc_oil_gas_pricing(frm);
	},

	custom_sale_value_without_tax(frm) { recalc_oil_gas_pricing(frm); },
	custom_vat_percent(frm) { recalc_oil_gas_pricing(frm); },
	custom_tax_percent(frm) { recalc_oil_gas_pricing(frm); },
	net_total(frm) { recalc_oil_gas_pricing(frm); },

});

function recalc_oil_gas_pricing(frm) {
	if (frm.doc.custom_types !== "Oil & Gas") {
		return;
	}
	const net_total = flt(frm.doc.net_total);
	const sale_value = flt(frm.doc.custom_sale_value_without_tax);
	const vat_pct = flt(frm.doc.custom_vat_percent);
	const tax_pct = flt(frm.doc.custom_tax_percent);

	const vat_amount = sale_value * vat_pct / 100;
	// Tax compounds on (Sale Value + VAT), matching the reference calculation.
	const tax_amount = (sale_value + vat_amount) * tax_pct / 100;
	const total_quoted = sale_value + vat_amount + tax_amount;
	const net_profit = sale_value - net_total;

	frm.set_value("custom_vat_amount", vat_amount);
	frm.set_value("custom_tax_amount", tax_amount);
	frm.set_value("custom_total_quoted_value", total_quoted);
	frm.set_value("custom_net_profit", net_profit);
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
