frappe.ui.form.on("Sales Order", {
	refresh: async function (frm) {
		await jagadamba.sales_flow.configure(frm, true);
		await prefill_sales_order(frm, false);
		frm.set_query("custom_quotation", function () {
			const filters = {docstatus: ["!=", 2]};
			for (const field of ["company", "currency", "custom_types"]) {
				if (frm.doc[field]) filters[field] = frm.doc[field];
			}
			return {filters};
		});

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

		setTimeout(() => {
			frm.remove_custom_button("Payment", "Create");
			frm.remove_custom_button("Payment Request", "Create");
			frm.remove_custom_button("Pick List", "Create");
			frm.remove_custom_button("Request for Raw Materials", "Create");
			frm.remove_custom_button("Purchase Order", "Create");
			frm.remove_custom_button("Project", "Create");

			if (frm.doc.docstatus === 1 && !frm.doc.project) {
				frm.add_custom_button(
					__("Project"),
					() => {
						let show_dialog = (default_name) => {
							frappe.prompt(
								{
									label: __("Project Name"),
									fieldname: "project_name",
									fieldtype: "Data",
									reqd: 1,
									default: default_name || "",
								},
								(values) => {
									frappe.call({
										method: "jagadamba.jagadamba.api.create_project",
										args: {
											project_name: values.project_name,
											customer: frm.doc.customer,
											sales_order: frm.doc.name,
										},
										freeze: true,
										freeze_message: __("Creating Project..."),
										callback: function (r) {
											if (r.message) {
												frappe.show_alert({
													message: __("Project {0} created", [r.message]),
													indicator: "green",
												});
												frm.reload_doc();
												frappe.set_route("Form", "Project", r.message);
											}
										},
									});
								},
								__("Create Project"),
								__("Create")
							);
						};

						if (frm.doc.custom_quotation) {
							frappe.db.get_value(
								"Quotation",
								frm.doc.custom_quotation,
								"custom_project",
								(r) => show_dialog(r && r.custom_project ? r.custom_project : "")
							);
						} else {
							show_dialog("");
						}
					},
					__("Create")
				);
			}

			if (frm.doc.docstatus === 1) {
				frm.add_custom_button(
					__("Order Confirmation Sheet"),
					() => {
						if (!frm.doc.project) {
							frappe.msgprint({
								title: __("Project Required"),
								message: __(
									"Please link a Project to this Sales Order before creating an Order Confirmation Sheet."
								),
								indicator: "orange",
							});
							return;
						}
						frappe.new_doc("Order Confirmation Sheet", {
							sales_order: frm.doc.name,
							date: frappe.datetime.get_today(),
						});
					},
					__("Create")
				);

				frm.add_custom_button(
					__("Purchase Order"),
					() => {
						if (!frm.doc.project) {
							frappe.msgprint({
								title: __("Project Required"),
								message: __(
									"Please link a Project to this Sales Order before creating a Purchase Order."
								),
								indicator: "orange",
							});
							return;
						}
						frappe.call({
							method: "jagadamba.jagadamba.api.make_purchase_order",
							args: { sales_order: frm.doc.name },
							freeze: true,
							freeze_message: __("Creating Purchase Order..."),
							callback: function (r) {
								if (r.message) {
									var doc = frappe.model.sync(r.message);
									frappe.set_route("Form", "Purchase Order", doc[0].name);
								}
							},
						});
					},
					__("Create")
				);
			}
		}, 100);
	},
});

frappe.ui.form.on("Sales Order", {
	refresh(frm) {
		if (frm.is_new()) return recalc_oil_gas_pricing(frm);
	},

	custom_quotation(frm) {
		return prefill_sales_order(frm, true);
	},

	custom_types: async function (frm) {
		await jagadamba.sales_flow.clear_type_items(frm, ["custom_vehicle_type", "oil_gas_item"]);
		await jagadamba.sales_flow.configure(frm);
		return recalc_oil_gas_pricing(frm);
	},

	custom_sale_value_without_tax(frm) { recalc_oil_gas_pricing(frm); },
	custom_vat_percent(frm) { recalc_oil_gas_pricing(frm); },
	custom_tax_percent(frm) { recalc_oil_gas_pricing(frm); },
	net_total(frm) { return recalc_oil_gas_pricing(frm); },
	custom_tax_basis(frm) { return recalc_oil_gas_pricing(frm); },

});

function recalc_oil_gas_pricing(frm) {
	return jagadamba.sales_flow.recalculate(frm);
}


function prefill_sales_order(frm, overwrite) {
	const fields = { custom_types: "custom_types", custom_vehicle_type: "custom_vehicle_type", oil_gas_item: "oil_gas_item" };
	return jagadamba.sales_flow.copy_from_source(frm, {
		doctype: "Quotation", link_field: "custom_quotation", fields, overwrite,
	});
}
