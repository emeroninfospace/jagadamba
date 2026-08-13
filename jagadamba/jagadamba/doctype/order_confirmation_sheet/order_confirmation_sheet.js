frappe.ui.form.on("Order Confirmation Sheet", {
	refresh: function (frm) {
		frm.set_query("parent_item", "item_groups", function () {
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

				if (r.message.custom_item_groups && r.message.custom_item_groups.length && !frm.doc.item_groups.length) {
					r.message.custom_item_groups.forEach((row) => {
						let child = frm.add_child("item_groups");
						child.parent_item = row.parent_item;
						child.estimated_budget = row.estimated_budget;
						child.remarks = row.remarks;
					});
					frm.refresh_field("item_groups");
				}
			},
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
					child.parent_item = row.parent_item;
					child.estimated_budget = row.estimated_budget;
					child.remarks = row.remarks;
				});
				frm.refresh_field("item_groups");
			},
		});
	},
});
