frappe.ui.form.on("Sales Order", {
	refresh: function (frm) {
		if (frm.doc.custom_quotation && (!frm.doc.custom_types || !frm.doc.custom_vehicle_type && !frm.doc.oil_gas_item)) {
			frappe.db.get_value("Quotation", frm.doc.custom_quotation,
				["custom_types", "custom_vehicle_type", "oil_gas_item"], (r) => {
					if (!r) return;
					if (!frm.doc.custom_types && r.custom_types) frm.set_value("custom_types", r.custom_types);
					if (!frm.doc.custom_vehicle_type && r.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
					if (!frm.doc.oil_gas_item && r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
				}
			);
		}

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
		recalc_oil_gas_pricing(frm);
	},

	custom_quotation(frm) {
		if (!frm.doc.custom_quotation) return;
		frappe.db.get_value("Quotation", frm.doc.custom_quotation,
			["custom_types", "custom_vehicle_type", "oil_gas_item",
			 "custom_sale_value_without_tax", "custom_vat_percent", "custom_tax_percent"], (r) => {
				if (!r) return;
				if (r.custom_types) frm.set_value("custom_types", r.custom_types);
				if (r.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
				if (r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
				if (r.custom_sale_value_without_tax && !frm.doc.custom_sale_value_without_tax) {
					frm.set_value("custom_sale_value_without_tax", r.custom_sale_value_without_tax);
				}
				if (r.custom_vat_percent && !frm.doc.custom_vat_percent) {
					frm.set_value("custom_vat_percent", r.custom_vat_percent);
				}
				if (r.custom_tax_percent && !frm.doc.custom_tax_percent) {
					frm.set_value("custom_tax_percent", r.custom_tax_percent);
				}
			}
		);
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
	if (frm.doc.custom_types !== "Oil & Gas") return;
	const net_total = flt(frm.doc.net_total);
	const sale_value = flt(frm.doc.custom_sale_value_without_tax);
	const vat_pct = flt(frm.doc.custom_vat_percent);
	const tax_pct = flt(frm.doc.custom_tax_percent);

	const vat_amount = sale_value * vat_pct / 100;
	const tax_amount = (sale_value + vat_amount) * tax_pct / 100;
	const total_quoted = sale_value + vat_amount + tax_amount;
	const net_profit = sale_value - net_total;

	frm.set_value("custom_vat_amount", vat_amount);
	frm.set_value("custom_tax_amount", tax_amount);
	frm.set_value("custom_total_quoted_value", total_quoted);
	frm.set_value("custom_net_profit", net_profit);
}

