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
		if (frm.doc.project && (!frm.doc.custom_types || !frm.doc.custom_vehicle_type && !frm.doc.oil_gas_item)) {
			frappe.db.get_value(
				"Project",
				frm.doc.project,
				["custom_types", "custom_vehicle_type", "oil_gas_item"],
				(r) => {
					if (!r) return;
					if (r.custom_types && !frm.doc.custom_types) frm.set_value("custom_types", r.custom_types);
					if (r.custom_vehicle_type && !frm.doc.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
					if (r.oil_gas_item && !frm.doc.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
				}
			);
		}
		update_total(frm);
		setup_sub_wbs_button(frm);
		refresh_actual_totals(frm);
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
			["sales_order", "customer", "custom_types", "custom_vehicle_type", "oil_gas_item"],
			(r) => {
				if (r) {
					frm.set_value("sales_order", r.sales_order || "");
					frm.set_value("customer", r.customer || "");
					frm.set_value("custom_types", r.custom_types || "");
					if (r.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
					if (r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
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
	wbs_items_remove(frm) {
		update_total(frm);
	},
	budget_amount(frm) {
		update_total(frm);
	},
});

function setup_sub_wbs_button(frm) {
	const grid = frm.fields_dict.wbs_items.grid;
	const $btn = grid.add_custom_button(__("Add Sub WBS"), function () {
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
					{
						fieldname: "main_wbs",
						fieldtype: "Data",
						hidden: 1,
					},
				],
			},
		],
		primary_action_label: __("Save"),
		primary_action(values) {
			const sub_items = values.sub_wbs_table || [];

			// Remove existing rows for this parent using Frappe API
			const to_remove = (frm.doc.sub_wbs_items || [])
				.filter(s => s.parent_wbs_row === main_row.name);
			to_remove.forEach(s => frappe.model.clear_doc("Project Budget Sub WBS", s.name));
			frm.doc.sub_wbs_items = (frm.doc.sub_wbs_items || [])
				.filter(s => s.parent_wbs_row !== main_row.name);

			// Add new rows with proper Frappe model metadata so deletion works
			sub_items.forEach((item, idx) => {
				const child = frappe.model.add_child(frm.doc, "Project Budget Sub WBS", "sub_wbs_items");
				child.parent_wbs_row = main_row.name;
				child.main_wbs = main_row.description || main_row.wbs_element || "";
				child.description = item.description;
				child.cost = flt(item.cost);
				child.wbs_element = item.wbs_element || (main_row.wbs_element
					? `${main_row.wbs_element}-${String(idx + 1).padStart(2, "0")}`
					: "");
			});

			// Recalculate WBS row cost from sub WBS total
			const sub_total = sub_items.reduce((s, i) => s + flt(i.cost), 0);
			if (sub_total) frappe.model.set_value(main_row.doctype, main_row.name, "budget_amount", sub_total);

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

function refresh_actual_totals(frm) {
	if (frm.is_new() || !frm.doc.project) return;
	frappe.call({
		method: "jagadamba.jagadamba.doctype.project_budget.project_budget.get_actual_totals",
		args: { project: frm.doc.project },
		callback(r) {
			if (!r || !r.message) return;
			// Update displayed values without marking the form dirty
			frm.doc.total_purchase_order_amount = flt(r.message.total_purchase_order_amount);
			frm.doc.total_sales_order_amount = flt(r.message.total_sales_order_amount);
			frm.refresh_field("total_purchase_order_amount");
			frm.refresh_field("total_sales_order_amount");
		},
	});
}
