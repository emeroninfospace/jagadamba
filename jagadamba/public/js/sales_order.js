frappe.ui.form.on("Sales Order", {
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
			return { filters: { item_group: "Finished Items", disabled: 0 } };
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
	custom_types: function (frm) {
		frm.set_value("custom_vehicle_type", "");
		frm.set_value("oil_gas_item", "");
	},

	// before_submit: function (frm) {
	// 	if (!frm.doc.custom_item_groups || !frm.doc.custom_item_groups.length) {
	// 		frappe.validated = false;
	// 		frappe.confirm(
	// 			__(
	// 				"Build Categories table is empty. Purchase Orders require items from Build Categories to be created. Are you sure you want to submit?"
	// 			),
	// 			() => {
	// 				frappe.validated = true;
	// 				frm.save("Submit");
	// 			}
	// 		);
	// 	}
	// },
});

// frappe.ui.form.on("Sales Order Item", {
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
