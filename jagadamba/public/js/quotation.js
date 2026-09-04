frappe.ui.form.on("Quotation", {
	refresh: function (frm) {
		frm.set_query("item_code", "items", function () {
			return { filters: { custom_parent_item: 1, disabled: 0 } };
		});

		frm.set_query("custom_vehicle_type", function () {
			return { filters: { custom_parent_item: 1, disabled: 0, item_group: "Finished Items" } };
		});

		// Filter enquiry_reference to show only Leads with an enquiry_number
		frm.set_query("enquiry_reference", function () {
			return { filters: { enquiry_number: ["!=", ""] } };
		});

		// Log Revision Note button — visible on saved/submitted quotations
		if (!frm.is_new()) {
			frm.add_custom_button(__("Log Revision Note"), function () {
				frappe.prompt(
					{ fieldtype: "Small Text", fieldname: "note", label: __("Revision Note"), reqd: 1 },
					function (values) {
						frappe.call({
							method: "jagadamba.jagadamba.overrides.quotation_overrides.log_revision_note",
							args: { quotation: frm.doc.name, note: values.note },
							callback: function () {
								frm.reload_doc();
								frappe.show_alert({ message: __("Revision note logged"), indicator: "green" });
							},
						});
					},
					__("Log Revision Note"),
					__("Save")
				);
			}, __("Actions"));
		}
	},

	enquiry_reference: function (frm) {
		if (!frm.doc.enquiry_reference) return;

		frappe.call({
			method: "jagadamba.jagadamba.overrides.quotation_overrides.get_enquiry_details",
			args: { enquiry_reference: frm.doc.enquiry_reference },
			callback: function (r) {
				if (!r.message) return;
				var d = r.message;

				if (d.quotation_to && !frm.doc.party_name) {
					frm.set_value("quotation_to", d.quotation_to);
					frm.set_value("party_name", d.party_name);
				}
				if (d.expected_closing_date && !frm.doc.expected_closing_date) {
					frm.set_value("expected_closing_date", d.required_completion_date);
				}
				if (d.person_responsible && !frm.doc.estimator) {
					frm.set_value("estimator", d.person_responsible);
				}
			},
		});
	},
});

frappe.ui.form.on("Quotation Item", {
	before_remove: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.item_code) return;
		let to_remove = (frm.doc.custom_item_groups || []).filter(
			(i) => i.parent_item === row.item_code
		);
		to_remove.forEach((i) => frappe.model.clear_doc(i.doctype, i.name));
		frm.doc.custom_item_groups = (frm.doc.custom_item_groups || []).filter(
			(i) => i.parent_item !== row.item_code
		);
		frm.refresh_field("custom_item_groups");
	},

	item_code: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];

		let current_parents = new Set(
			(frm.doc.items || []).map((i) => i.item_code).filter(Boolean)
		);
		let stale = (frm.doc.custom_item_groups || []).filter(
			(i) => i.parent_item && !current_parents.has(i.parent_item)
		);
		stale.forEach((i) => frappe.model.clear_doc(i.doctype, i.name));
		frm.doc.custom_item_groups = (frm.doc.custom_item_groups || []).filter(
			(i) => !i.parent_item || current_parents.has(i.parent_item)
		);
		frm.refresh_field("custom_item_groups");

		if (!row.item_code) return;

		frappe.dom.freeze(__("Fetching build category items..."));
		frappe.call({
			method: "jagadamba.jagadamba.api.get_child_items_for_parent_items",
			args: { parent_item_codes: JSON.stringify([row.item_code]) },
			callback: function (r) {
				frappe.dom.unfreeze();
				if (!r.message || !r.message.length) return;

				let added = 0;
				r.message.forEach((item) => {
					let exists = (frm.doc.custom_item_groups || []).some(
						(i) => i.item_code === item.item_code
					);
					if (!exists) {
						let child = frm.add_child("custom_item_groups");
						child.parent_item = item.parent_item;
						child.item_code = item.item_code;
						child.item_name = item.item_name;
						child.uom = item.uom;
						child.item_group = item.item_group;
						child.description = item.description;
						added++;
					}
				});
				frm.refresh_field("custom_item_groups");
				if (added) {
					frappe.show_alert({
						message: __("{0} item(s) added to Build Categories", [added]),
						indicator: "green",
					});
				}
			},
		});
	},
});
