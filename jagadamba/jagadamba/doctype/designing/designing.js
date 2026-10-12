frappe.ui.form.on("Designing", {
	refresh: function (frm) {
		if (frm.doc.docstatus !== 2) {
			frm.add_custom_button(__("Fetch PO Items"), () => {
				if (!frm.doc.project) {
					frappe.msgprint({
						title: __("Project Required"),
						message: __("Please set the Project before fetching PO items."),
						indicator: "orange",
					});
					return;
				}
				frappe.call({
					method: "jagadamba.jagadamba.api.get_po_items_for_designing",
					args: { project: frm.doc.project },
					freeze: true,
					freeze_message: __("Fetching PO Items..."),
					callback: function (r) {
						if (!r.message || !r.message.length) {
							frappe.show_alert({
								message: __("No submitted PO items found for this project."),
								indicator: "orange",
							});
							return;
						}
						let added = 0;
						r.message.forEach((item) => {
							let exists = (frm.doc.raw_materials || []).some(
								(i) => i.item_code === item.item_code
							);
							if (!exists) {
								let child = frm.add_child("raw_materials");
								child.item_code = item.item_code;
								child.item_name = item.item_name;
								child.qty = item.qty;
								child.uom = item.uom;
								child.description = item.description;
								added++;
							}
						});
						frm.refresh_field("raw_materials");
						frappe.show_alert({
							message: __("{0} item(s) added to Raw Materials", [added]),
							indicator: "green",
						});
					},
				});
			});
		}

		if (frm.doc.docstatus === 1) {
			frm.add_custom_button(
				__("BOM"),
				() => {
					if (!frm.doc.item) {
						frappe.msgprint({
							title: __("Item Required"),
							message: __("Please set the Item field before creating a BOM."),
							indicator: "orange",
						});
						return;
					}
					frappe.call({
						method: "jagadamba.jagadamba.api.create_bom_from_designing",
						args: { designing: frm.doc.name },
						freeze: true,
						freeze_message: __("Creating BOM..."),
						callback: function (r) {
							if (r.message) {
								var doc = frappe.model.sync(r.message);
								frappe.set_route("Form", "BOM", doc[0].name);
							}
						},
					});
				},
				__("Create")
			);
		}
	},

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

frappe.ui.form.on("Designing Raw Material", {
	item_code: function (frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item_code) return;
		frappe.db.get_value("Item", row.item_code, ["item_name", "stock_uom"], (r) => {
			if (!r) return;
			frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
			if (!row.uom) {
				frappe.model.set_value(cdt, cdn, "uom", r.stock_uom || "");
			}
		});
	},
});
