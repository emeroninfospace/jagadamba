frappe.ui.form.on("Sales Order", {
	refresh: function (frm) {
		frm.set_query("item_code", "items", function () {
			return { filters: { custom_parent_item: 1, disabled: 0 } };
		});

		setTimeout(() => {
			frm.remove_custom_button("Payment", "Create");
			frm.remove_custom_button("Payment Request", "Create");
			frm.remove_custom_button("Pick List", "Create");
			frm.remove_custom_button("Request for Raw Materials", "Create");
			frm.remove_custom_button("Purchase Order", "Create");
			frm.remove_custom_button("Project", "Create");

			if (frm.doc.docstatus === 1) {
				frm.add_custom_button(
					__("Project"),
					() => {
						frappe.prompt(
							{
								label: __("Project Name"),
								fieldname: "project_name",
								fieldtype: "Data",
								reqd: 1,
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
					},
					__("Create")
				);

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

frappe.ui.form.on("Sales Order Item", {
	item_code: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.item_code) return;

		frappe.call({
			method: "jagadamba.jagadamba.api.get_child_items_for_parent_items",
			args: { parent_item_codes: JSON.stringify([row.item_code]) },
			callback: function (r) {
				if (!r.message || !r.message.length) return;
				r.message.forEach((item) => {
					let exists = (frm.doc.custom_item_groups || []).some(
						(i) => i.item_code === item.item_code
					);
					if (!exists) {
						let child = frm.add_child("custom_item_groups");
						child.parent_item = item.parent_item;
						child.item_code = item.item_code;
						child.item_name = item.item_name;
						child.uom = item.uom;
					}
				});
				frm.refresh_field("custom_item_groups");
			},
		});
	},
});
