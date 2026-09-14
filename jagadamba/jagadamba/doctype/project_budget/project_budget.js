frappe.ui.form.on("Project Budget", {
	onload(frm) {
		if (frm.is_new() && !frm.doc.fiscal_year) {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Fiscal Year",
					filters: [
						["year_start_date", "<=", frappe.datetime.get_today()],
						["year_end_date", ">=", frappe.datetime.get_today()],
						["disabled", "=", 0],
					],
					fields: ["name"],
					limit: 1,
				},
				callback(r) {
					if (r.message && r.message.length) {
						frm.set_value("fiscal_year", r.message[0].name);
					}
				},
			});
		}
	},

	refresh(frm) {
		update_total(frm);
	},

	project(frm) {
		if (!frm.doc.project) {
			frm.set_value("sales_order", "");
			frm.set_value("customer", "");
			frm.set_value("customer_name", "");
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

frappe.ui.form.on("Project Budget WBS", {
	budget_amount(frm) {
		update_total(frm);
	},
	wbs_items_add(frm) {
		update_total(frm);
	},
	wbs_items_remove(frm) {
		update_total(frm);
	},
});

function update_total(frm) {
	let total = 0;
	(frm.doc.wbs_items || []).forEach((row) => {
		total += flt(row.budget_amount);
	});
	frm.set_value("total_budget_amount", total);
}
