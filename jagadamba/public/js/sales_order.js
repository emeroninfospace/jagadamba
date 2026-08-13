frappe.ui.form.on("Sales Order", {
	refresh: function (frm) {
		setTimeout(() => {
			frm.remove_custom_button("Payment", "Create");
			frm.remove_custom_button("Payment Request", "Create");
			frm.remove_custom_button("Pick List", "Create");
			frm.remove_custom_button("Request for Raw Materials", "Create");

			if (frm.doc.docstatus === 1) {
				frm.add_custom_button(
					__("Order Confirmation Sheet"),
					() => {
						frappe.new_doc("Order Confirmation Sheet", {
							sales_order: frm.doc.name,
							date: frappe.datetime.get_today(),
						});
					},
					__("Create")
				);
			}
		}, 0);
	},

	custom_quotation: function (frm) {
		if (!frm.doc.custom_quotation) return;

		// Clear existing item groups before fetching
		frm.clear_table("custom_item_groups");

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: frm.doc.custom_quotation },
			callback: function (r) {
				if (!r.message || !r.message.custom_item_groups) return;
				r.message.custom_item_groups.forEach((row) => {
					let child = frm.add_child("custom_item_groups");
					child.item_group = row.item_group;
					child.remarks = row.remarks;
				});
				frm.refresh_field("custom_item_groups");
			},
		});
	},
});
