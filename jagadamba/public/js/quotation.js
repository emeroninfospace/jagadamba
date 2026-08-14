frappe.ui.form.on("Quotation", {
	refresh: function (frm) {
		frm.set_query("item_code", "items", function () {
			return { filters: { custom_parent_item: 1, disabled: 0 } };
		});
	},
});

frappe.ui.form.on("Quotation Item", {
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
