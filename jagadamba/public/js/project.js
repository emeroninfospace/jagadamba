frappe.ui.form.on("Project", {
	refresh(frm) {
		update_estimated_costing(frm);

		if (frm.doc.sales_order && (!frm.doc.custom_types || !frm.doc.custom_vehicle_type && !frm.doc.oil_gas_item)) {
			frappe.db.get_value(
				"Sales Order",
				frm.doc.sales_order,
				["custom_types", "custom_vehicle_type", "oil_gas_item"],
				(r) => {
					if (!r) return;
					let changed = false;
					if (!frm.doc.custom_types && r.custom_types) { frm.set_value("custom_types", r.custom_types); changed = true; }
					if (!frm.doc.custom_vehicle_type && r.custom_vehicle_type) { frm.set_value("custom_vehicle_type", r.custom_vehicle_type); changed = true; }
					if (!frm.doc.oil_gas_item && r.oil_gas_item) { frm.set_value("oil_gas_item", r.oil_gas_item); changed = true; }
					if (changed) frm.save();
				}
			);
		}

		setTimeout(() => {
			["Task", "Timesheet", "Issue", "Project Update", "Expense Claim"].forEach(dt => {
				$(frm.wrapper).find(`.document-link[data-doctype="${dt}"]`).hide();
			});
			const hide_groups = ["Purchase", "Manufacture"];
			$(frm.wrapper).find(".transactions .col-md-4").each(function () {
				const label = $(this).find(".form-link-title span").text().trim();
				if (hide_groups.includes(label) || $(this).find(".document-link:visible").length === 0) {
					$(this).hide();
				}
			});
			if (frm.dashboard && frm.dashboard.links_area) {
				frm.dashboard.links_area.collapse(true);
			}

			// Make Activity section collapsible
			const $afterSave = $(frm.wrapper).find(".form-footer .after-save");
			if ($afterSave.length && !$afterSave.data("collapsible-setup")) {
				$afterSave.data("collapsible-setup", true);
				const $heading = $(`
					<div class="activity-section-head" style="cursor:pointer; padding: 8px 0; font-weight: 600; font-size: 13px; display:flex; align-items:center; gap:6px; border-top: 1px solid var(--border-color);">
						<span>${__("Activity")}</span>
						<span class="activity-chevron">&#x2303;</span>
					</div>
				`);
				$afterSave.before($heading);
				$heading.on("click", () => {
					const collapsed = $afterSave.is(":hidden");
					$afterSave.toggle();
					$heading.find(".activity-chevron").html(collapsed ? "&#x2303;" : "&#x2304;");
				});
			}
		}, 500);

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

			frm.add_custom_button(__("Documents"), function () {
				frappe.call({
					method: "jagadamba.jagadamba.api.create_drawing",
					args: { project: frm.doc.name },
					freeze: true,
					freeze_message: __("Loading..."),
					callback: function (r) {
						if (!r.message) return;
						if (r.message.existing) {
							frappe.set_route("Form", "Documents", r.message.existing);
						} else {
							var doc = frappe.model.sync(r.message);
							frappe.set_route("Form", "Documents", doc[0].name);
						}
					},
				});
			}, __("Create"));

			frm.add_custom_button(__("BOM"), function () {
				frappe.call({
					method: "jagadamba.jagadamba.api.create_bom_from_project",
					args: { project: frm.doc.name },
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

	validate(frm) {
		update_estimated_costing(frm);
	},
});


frappe.ui.form.on("Project Items", {
	estimated_amount(frm) {
		update_estimated_costing(frm);
	},

	custom_project_items_add(frm) {
		update_estimated_costing(frm);
	},

	custom_project_items_remove(frm) {
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