frappe.ui.form.on("Quotation Item Group", {
	item_group: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.item_group) return;

		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item",
				filters: { item_group: row.item_group, disabled: 0 },
				fields: ["item_code", "item_name", "item_group", "stock_uom"],
				limit_page_length: 0,
			},
			callback: function (r) {
				if (!r.message || !r.message.length) {
					frappe.msgprint(
						__("No active items found for item group: {0}", [row.item_group])
					);
					return;
				}
				(r.message || []).forEach((item) => {
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
	},
});
