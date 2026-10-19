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
		// A Job Item copied from the Lead or Opportunity becomes the quoted line on a new Quotation.
		if (frm.is_new()) {
			await add_job_item_to_items(frm);
			await recalc_costing(frm);
		} else {
			frm.__jagadamba_job_item = {doc: frm.doc, item: frm.doc.oil_gas_item};
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

	opportunity(frm) { return prefill_quotation_type(frm); },
	oil_gas_item(frm) { return add_job_item_to_items(frm); },

	custom_types: async function (frm) {
		await jagadamba.sales_flow.clear_type_items(frm, ["custom_vehicle_type", "oil_gas_item"]);
		return jagadamba.sales_flow.configure(frm);
	},
});
frappe.ui.form.on("Quotation Cost Estimate", {
	qty(frm, cdt, cdn) { return update_cost_row(frm, cdt, cdn); },
	rate(frm, cdt, cdn) { return update_cost_row(frm, cdt, cdn); },
	custom_costing_remove(frm) { return recalc_costing(frm); },
});

frappe.ui.form.on("Quotation Item", {
	item_code: after_item_totals,
	qty: after_item_totals,
	rate: after_item_totals,
	discount_percentage: after_item_totals,
	discount_amount: after_item_totals,
	items_remove: after_item_totals,
});

// ERPNext recalculates Net Total in its own handlers, which run after these and may fetch prices first.
function after_item_totals(frm) {
	setTimeout(() => frappe.after_ajax(() => recalc_costing(frm)), 0);
}

async function update_cost_row(frm, cdt, cdn) {
	const row = locals[cdt][cdn];
	await frappe.model.set_value(cdt, cdn, "amount", flt(flt(row.qty) * flt(row.rate), precision("amount", row)));
	return recalc_costing(frm);
}

// Total Estimated Value is the Costing table; Net Profit is the items' Net Total (the Job Item's rate) minus it.
function recalc_costing(frm) {
	const doc = frm.doc;
	if (doc.docstatus !== 0 || !doc.custom_enable_estimation) return Promise.resolve();
	const cost = flt((doc.custom_costing || []).reduce((sum, row) => sum + flt(row.amount), 0),
		precision("custom_total_estimated_value"));
	const values = {
		custom_total_estimated_value: cost,
		custom_net_profit: flt(flt(doc.net_total) - cost, precision("custom_net_profit")),
	};
	const changes = Object.fromEntries(Object.entries(values).filter(([field, value]) => flt(doc[field]) !== value));
	return Object.keys(changes).length ? frm.set_value(changes) : Promise.resolve();
}

// The Job Item is what the client manufactures and quotes, so it is the customer-facing line in Items.
// Changing the Job Item swaps that line's item; clearing it leaves the Items table alone.
async function add_job_item_to_items(frm) {
	const doc = frm.doc;
	const item = doc.oil_gas_item;
	const tracked = frm.__jagadamba_job_item;
	const previous = tracked && tracked.doc === doc ? tracked.item : null;
	frm.__jagadamba_job_item = {doc, item};
	if (!item || doc.docstatus !== 0 || !doc.custom_show_job_item) return;
	const items = doc.items || [];
	if (items.some(row => row.item_code === item)) return;
	const row = (previous && items.find(row => row.item_code === previous))
		|| items.find(row => !row.item_code)
		|| frm.add_child("items");
	if (!flt(row.qty)) row.qty = 1;
	frm.refresh_field("items");
	await frappe.model.set_value(row.doctype, row.name, "item_code", item);
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
