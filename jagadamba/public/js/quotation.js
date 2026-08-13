frappe.ui.form.on("Quotation", {
	refresh: function (frm) {
		frm.set_query("parent_item", "custom_item_groups", function () {
			return { filters: { custom_parent_item: 1, disabled: 0 } };
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
