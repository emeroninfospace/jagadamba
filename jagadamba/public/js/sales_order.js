frappe.ui.form.on("Sales Order", {
	refresh: function (frm) {
		frm.set_query("parent_item", "custom_item_groups", function () {
			return { filters: { custom_parent_item: 1, disabled: 0 } };
		});

		setTimeout(() => {
			frm.remove_custom_button("Payment", "Create");
			frm.remove_custom_button("Payment Request", "Create");
			frm.remove_custom_button("Pick List", "Create");
			frm.remove_custom_button("Request for Raw Materials", "Create");

			// Replace the standard PO button with a direct-creation one
			frm.remove_custom_button("Purchase Order", "Create");

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
		}, 0);
	},

	custom_quotation: function (frm) {
		if (!frm.doc.custom_quotation) return;

		frm.clear_table("custom_item_groups");

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: frm.doc.custom_quotation },
			callback: function (r) {
				if (!r.message || !r.message.custom_item_groups) return;
				r.message.custom_item_groups.forEach((row) => {
					let child = frm.add_child("custom_item_groups");
					child.parent_item = row.parent_item;
					child.estimated_budget = row.estimated_budget;
					child.remarks = row.remarks;
				});
				frm.refresh_field("custom_item_groups");
			},
		});
	},
});

frappe.ui.form.on("Quotation Item Group", {
	parent_item: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.parent_item) return;

		frappe.db.get_value("Item", row.parent_item, "item_group", (r) => {
			if (!r || !r.item_group) return;

			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Item",
					filters: {
						item_group: r.item_group,
						disabled: 0,
						custom_parent_item: 0,
					},
					fields: ["item_code", "item_name", "item_group", "stock_uom"],
					limit_page_length: 0,
				},
				callback: function (r2) {
					if (!r2.message || !r2.message.length) {
						frappe.msgprint(
							__("No child items found for parent item: {0}", [row.parent_item])
						);
						return;
					}
					(r2.message || []).forEach((item) => {
						let exists = (frm.doc.items || []).some(
							(i) => i.item_code === item.item_code
						);
						if (!exists) {
							let child = frm.add_child("items");
							child.item_code = item.item_code;
							child.item_name = item.item_name;
							child.item_group = item.item_group;
							child.uom = item.stock_uom;
							child.qty = 0;
						}
					});
					frm.refresh_field("items");
				},
			});
		});
	},
});
