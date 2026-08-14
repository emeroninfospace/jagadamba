frappe.ui.form.on("Order Confirmation Sheet", {
	refresh: function (frm) {
		frm.set_query("item_code", "item_groups", function () {
			return { filters: { custom_parent_item: 1, disabled: 0 } };
		});

		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(
				__("Designing"),
				() => {
					frappe.new_doc("Designing", {
						project: frm.doc.project,
						sales_order: frm.doc.sales_order,
						ocs: frm.doc.name,
						vehicle_type: frm.doc.vehicle_type,
					});
				},
				__("Create")
			);
		}
	},

	sales_order: function (frm) {
		if (!frm.doc.sales_order) return;

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Sales Order", name: frm.doc.sales_order },
			callback: function (r) {
				if (!r.message) return;

				if (r.message.custom_vehicle_type) {
					frm.set_value("vehicle_type", r.message.custom_vehicle_type);
				}

				if (r.message.project && !frm.doc.project) {
					frm.set_value("project", r.message.project);
				}

				if (frm.doc.item_groups && frm.doc.item_groups.length) return;

				// Copy parent items directly from SO's main items table
				let so_items = r.message.items || [];
				if (!so_items.length) return;

				so_items.forEach((item) => {
					let child = frm.add_child("item_groups");
					child.item_code = item.item_code;
					child.item_name = item.item_name;
					child.uom = item.uom;
				});
				frm.refresh_field("item_groups");
			},
		});
	},
});
