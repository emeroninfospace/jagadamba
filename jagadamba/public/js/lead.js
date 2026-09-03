frappe.ui.form.on("Lead", {
	refresh: function (frm) {
		frm.set_query("custom_vehicle_type", function () {
			return { filters: { custom_parent_item: 1, disabled: 0, item_group: "Finished Items" } };
		});

		setTimeout(() => {
			frm.remove_custom_button("Prospect", "Create");
			frm.remove_custom_button("Add to Prospect", "Action");
		}, 100);

		if (frm.is_new()) {
			frm.set_intro(__("Enquiry Number will be auto-generated on save."), "blue");
		}
	},

	custom_customers: function (frm) {
		if (!frm.doc.custom_customers) {
			frm.set_value("first_name", "");
			frm.set_value("last_name", "");
			return;
		}

		frappe.db.get_value(
			"Customer",
			frm.doc.custom_customers,
			["customer_name", "first_name", "last_name"],
			function (r) {
				if (!r) return;

				if (r.first_name) {
					frm.set_value("first_name", r.first_name);
					frm.set_value("last_name", r.last_name || "");
				} else if (r.customer_name) {
					// fallback: split customer_name into first/last
					var parts = r.customer_name.trim().split(" ");
					frm.set_value("first_name", parts[0]);
					frm.set_value("last_name", parts.slice(1).join(" ") || "");
				}
			}
		);
	},
});
