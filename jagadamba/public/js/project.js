frappe.ui.form.on("Project", {
	refresh(frm) {
		update_estimated_costing(frm);

		if (!frm.is_new()) {
			frm.add_custom_button(__("Project Budget"), function () {
				frappe.call({
					method: "jagadamba.jagadamba.api.create_project_budget",
					args: { project: frm.doc.name },
					freeze: true,
					freeze_message: __("Loading..."),
					callback: function (r) {
						if (!r.message) return;
						if (r.message.existing) {
							frappe.set_route("Form", "Project Budget", r.message.existing);
						} else {
							var doc = frappe.model.sync(r.message);
							frappe.set_route("Form", "Project Budget", doc[0].name);
						}
					},
				});
			}, __("Create"));

			frm.add_custom_button(__("Drawing"), function () {
				frappe.call({
					method: "jagadamba.jagadamba.api.create_drawing",
					args: { project: frm.doc.name },
					freeze: true,
					freeze_message: __("Loading..."),
					callback: function (r) {
						if (!r.message) return;
						if (r.message.existing) {
							frappe.set_route("Form", "Drawing", r.message.existing);
						} else {
							var doc = frappe.model.sync(r.message);
							frappe.set_route("Form", "Drawing", doc[0].name);
						}
					},
				});
			}, __("Create"));
		}
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