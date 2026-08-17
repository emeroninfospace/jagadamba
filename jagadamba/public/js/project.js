frappe.ui.form.on("Project", {
	refresh(frm) {
		update_estimated_costing(frm);
	},

	validate(frm) {
		update_estimated_costing(frm);
	},
});


frappe.ui.form.on("Project Items", {
	estimated_amount(frm, cdt, cdn) {
		update_estimated_costing(frm);
	},

	custom_project_items_add(frm, cdt, cdn) {
		update_estimated_costing(frm);
	},

	custom_project_items_remove(frm, cdt, cdn) {
		update_estimated_costing(frm);
	},
});


function update_estimated_costing(frm) {
	let total = 0;

	(frm.doc.custom_project_items || []).forEach(row => {
		total += flt(row.estimated_amount);
	});

	frm.set_value("estimated_costing", total);
}