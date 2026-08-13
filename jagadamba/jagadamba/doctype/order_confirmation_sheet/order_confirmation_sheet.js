frappe.ui.form.on("Order Confirmation Sheet", {
	sales_order: function (frm) {
		if (!frm.doc.sales_order) return;

		frappe.db.get_value("Sales Order", frm.doc.sales_order, "custom_vehicle_type", (r) => {
			if (r && r.custom_vehicle_type) {
				frm.set_value("vehicle_type", r.custom_vehicle_type);
			}
		});
	},

	quotation: function (frm) {
		if (!frm.doc.quotation || frm.doc.item_groups.length) return;

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: frm.doc.quotation },
			callback: function (r) {
				if (!r.message || !r.message.custom_item_groups) return;
				r.message.custom_item_groups.forEach((row) => {
					let child = frm.add_child("item_groups");
					child.item_group = row.item_group;
					child.remarks = row.remarks;
				});
				frm.refresh_field("item_groups");
			},
		});
	},
});
