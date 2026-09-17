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
		if (frm.doc.project && !frm.doc.project_no) {
			frm.set_value("project_no", frm.doc.project);
		}
		if (frm.doc.project && !frm.doc.custom_types) {
			frappe.db.get_value("Project", frm.doc.project, "custom_types", (r) => {
				if (r && r.custom_types) frm.set_value("custom_types", r.custom_types);
			});
		}
		update_total(frm);
		setup_sub_wbs_button(frm);
	},

	project(frm) {
		if (!frm.doc.project) {
			frm.set_value("project_no", "");
			frm.set_value("custom_types", "");
			frm.set_value("sales_order", "");
			frm.set_value("customer", "");
			frm.set_value("customer_name", "");
			return;
		}
		frm.set_value("project_no", frm.doc.project);
		frappe.db.get_value(
			"Project",
			frm.doc.project,
			["sales_order", "customer", "custom_types"],
			(r) => {
				if (r) {
					frm.set_value("sales_order", r.sales_order || "");
					frm.set_value("customer", r.customer || "");
					frm.set_value("custom_types", r.custom_types || "");
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
	wbs_items_add(frm) {
		update_total(frm);
	},
	budget_amount(frm) {
		update_total(frm);
	},
	wbs_items_remove(frm) {
		update_total(frm);
	},
});

function setup_sub_wbs_button(frm) {
	const grid = frm.fields_dict.wbs_items.grid;
	const $btn = grid.add_custom_button(__("Sub WBS"), function () {
		const selected = grid.get_selected_children();
		if (!selected || !selected.length) {
			frappe.msgprint(__("Select a Main WBS row first (tick its checkbox)."));
			return;
		}
		open_sub_wbs_dialog(frm, selected[0]);
	});
	grid.wrapper.find(".grid-add-row").after($btn);
}

function open_sub_wbs_dialog(frm, main_row) {
	const existing = (frm.doc.sub_wbs_items || [])
		.filter(s => s.parent_wbs_row === main_row.name)
		.map(s => ({ ...s }));

	const dialog = new frappe.ui.Dialog({
		title: __("Sub WBS — {0}", [main_row.description || main_row.wbs_element || ""]),
		size: "large",
		fields: [
			{
				fieldname: "sub_wbs_table",
				fieldtype: "Table",
				label: __("Sub WBS Items"),
				cannot_add_rows: false,
				cannot_delete_rows: false,
				data: existing,
				fields: [
					{
						label: __("Description"),
						fieldname: "description",
						fieldtype: "Data",
						in_list_view: 1,
						reqd: 1,
						columns: 4,
					},
					{
						label: __("WBS Element"),
						fieldname: "wbs_element",
						fieldtype: "Data",
						in_list_view: 1,
						columns: 3,
					},
					{
						label: __("Cost"),
						fieldname: "cost",
						fieldtype: "Float",
						in_list_view: 1,
						reqd: 1,
						columns: 3,
					},
					{
						fieldname: "parent_wbs_row",
						fieldtype: "Data",
						hidden: 1,
					},
				],
			},
		],
		primary_action_label: __("Save"),
		primary_action(values) {
			const sub_items = values.sub_wbs_table || [];

			sub_items.forEach((item, idx) => {
				item.parent_wbs_row = main_row.name;
				if (!item.wbs_element && main_row.wbs_element) {
					item.wbs_element = `${main_row.wbs_element}-${String(idx + 1).padStart(2, "0")}`;
				}
			});

			frm.doc.sub_wbs_items = (frm.doc.sub_wbs_items || [])
				.filter(s => s.parent_wbs_row !== main_row.name)
				.concat(sub_items);

			if (sub_items.length) {
				const sub_total = sub_items.reduce((sum, i) => sum + flt(i.cost), 0);
				frappe.model.set_value(main_row.doctype, main_row.name, "budget_amount", sub_total);
			}

			frm.refresh_field("sub_wbs_items");
			update_total(frm);
			dialog.hide();

			frappe.show_alert({
				message: __("{0} sub WBS item(s) saved", [sub_items.length]),
				indicator: "green",
			});
		},
	});

	dialog.show();
}

function update_total(frm) {
	let total = 0;
	(frm.doc.wbs_items || []).forEach(row => {
		total += flt(row.budget_amount);
	});
	frm.set_value("total_budget_amount", total);
}
