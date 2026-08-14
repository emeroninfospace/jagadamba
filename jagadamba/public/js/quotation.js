frappe.ui.form.on("Quotation", {
	refresh: function (frm) {
		frm.set_query("item_code", "items", function () {
			return { filters: { custom_parent_item: 1, disabled: 0 } };
		});
	},
});

frappe.ui.form.on("Quotation Item", {
	before_remove: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.item_code) return;
		frm.doc.custom_item_groups = (frm.doc.custom_item_groups || []).filter(
			(i) => i.parent_item !== row.item_code
		);
		frm.refresh_field("custom_item_groups");
	},

	item_code: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];

		// Remove entries whose parent_item is no longer in the items table
		let current_parents = new Set(
			(frm.doc.items || []).map((i) => i.item_code).filter(Boolean)
		);
		frm.doc.custom_item_groups = (frm.doc.custom_item_groups || []).filter(
			(i) => !i.parent_item || current_parents.has(i.parent_item)
		);
		frm.refresh_field("custom_item_groups");

		if (!row.item_code) return;

		frappe.dom.freeze(__("Fetching build category items..."));
		frappe.call({
			method: "jagadamba.jagadamba.api.get_child_items_for_parent_items",
			args: { parent_item_codes: JSON.stringify([row.item_code]) },
			callback: function (r) {
				frappe.dom.unfreeze();
				if (!r.message || !r.message.length) return;

				let added = 0;
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
						added++;
					}
				});
				frm.refresh_field("custom_item_groups");
				if (added) {
					frappe.show_alert({
						message: __("{0} item(s) added to Build Categories", [added]),
						indicator: "green",
					});
				}
			},
		});
	},
});
