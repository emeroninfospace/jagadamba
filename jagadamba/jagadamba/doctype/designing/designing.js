frappe.ui.form.on("Designing", {
	project: function (frm) {
		if (!frm.doc.project) return;

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Project", name: frm.doc.project },
			callback: function (r) {
				if (!r.message) return;
				if (r.message.customer) {
					frm.set_value("customer", r.message.customer);
					frappe.db.get_value("Customer", r.message.customer, "customer_name", (cr) => {
						if (cr && cr.customer_name) {
							frm.set_value("customer_name", cr.customer_name);
						}
					});
				}
			},
		});
	},

	ocs: function (frm) {
		if (!frm.doc.ocs) return;

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Order Confirmation Sheet", name: frm.doc.ocs },
			callback: function (r) {
				if (!r.message) return;
				if (!frm.doc.sales_order && r.message.sales_order) {
					frm.set_value("sales_order", r.message.sales_order);
				}
				if (!frm.doc.vehicle_type && r.message.vehicle_type) {
					frm.set_value("vehicle_type", r.message.vehicle_type);
				}
			},
		});
	},
});
