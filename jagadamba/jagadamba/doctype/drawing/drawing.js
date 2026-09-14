frappe.ui.form.on("Drawing", {
	refresh(frm) {
		if (frm.doc.docstatus === 1 && frm.doc.workflow_state === "Final Released" && !frm.doc.bom) {
			frm.add_custom_button(__("BOM"), function () {
				frappe.call({
					method: "jagadamba.jagadamba.api.create_bom_from_drawing",
					args: { drawing: frm.doc.name },
					freeze: true,
					freeze_message: __("Creating BOM..."),
					callback: function (r) {
						if (r.message) {
							var doc = frappe.model.sync(r.message);
							frappe.set_route("Form", "BOM", doc[0].name);
						}
					},
				});
			}, __("Create"));
		}
	},

	project(frm) {
		if (!frm.doc.project) {
			frm.set_value("sales_order", "");
			frm.set_value("customer", "");
			frm.set_value("customer_name", "");
			frm.set_value("project_budget", "");
			return;
		}
		frappe.db.get_value(
			"Project",
			frm.doc.project,
			["sales_order", "customer"],
			(r) => {
				if (r) {
					frm.set_value("sales_order", r.sales_order || "");
					frm.set_value("customer", r.customer || "");
				}
			}
		);
		frappe.db.get_value(
			"Project Budget",
			{ project: frm.doc.project, docstatus: 1 },
			"name",
			(r) => {
				frm.set_value("project_budget", r?.name || "");
			}
		);
	},

	customer(frm) {
		if (!frm.doc.customer) {
			frm.set_value("customer_name", "");
			return;
		}
		frappe.db.get_value("Customer", frm.doc.customer, "customer_name", (r) => {
			frm.set_value("customer_name", r?.customer_name || "");
		});
	},
});

frappe.ui.form.on("Drawing Raw Material", {
	item_code(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row.item_code) return;
		frappe.db.get_value("Item", row.item_code, ["item_name", "stock_uom"], (r) => {
			if (r) {
				frappe.model.set_value(cdt, cdn, "item_name", r.item_name || "");
				if (!row.uom) {
					frappe.model.set_value(cdt, cdn, "uom", r.stock_uom || "");
				}
			}
		});
	},
});
