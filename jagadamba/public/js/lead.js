function set_vehicle_type_query(frm) {
	frm.set_query("custom_vehicle_type", function () {
		let filters = { custom_parent_item: 1, disabled: 0, item_group: "Finished Items" };
		if (frm.doc.custom_types && frm.doc.custom_types !== "Oil & Gas") {
			filters.custom_types = frm.doc.custom_types;
		}
		return { filters: filters };
	});
}

function set_oil_gas_item_query(frm) {
	frm.set_query("oil_gas_item", function () {
		return { filters: { item_group: "Finished Items", disabled: 0 } };
	});
}

frappe.ui.form.on("Lead", {
	refresh: function (frm) {
		set_vehicle_type_query(frm);
		set_oil_gas_item_query(frm);

		setTimeout(() => {
			frm.remove_custom_button("Prospect", "Create");
			frm.remove_custom_button("Add to Prospect", "Action");
		}, 100);
	},

	custom_types: function (frm) {
		frm.set_value("custom_vehicle_type", "");
		frm.set_value("oil_gas_item", "");
		set_vehicle_type_query(frm);
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
					var parts = r.customer_name.trim().split(" ");
					frm.set_value("first_name", parts[0]);
					frm.set_value("last_name", parts.slice(1).join(" ") || "");
				}
			}
		);
	},
});
