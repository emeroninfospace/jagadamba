frappe.ui.form.on("Lead", {
	refresh: async function (frm) {
		await jagadamba.sales_flow.configure(frm, true);

		// ERPNext adds these after this handler; Opportunities are not created from a Lead.
		setTimeout(() => {
			frm.remove_custom_button("Prospect", "Create");
			frm.remove_custom_button("Add to Prospect", "Action");
			frm.remove_custom_button("Opportunity", "Create");
		}, 100);
	},

	custom_types: async function (frm) {
		await jagadamba.sales_flow.clear_type_items(frm, ["custom_vehicle_type", "oil_gas_item"]);
		await jagadamba.sales_flow.configure(frm);
	},

	custom_customers: async function (frm) {
		const doc = frm.doc;
		const customer = doc.custom_customers;
		if (!customer) return frm.set_value({first_name: "", last_name: ""});
		const first_name = doc.first_name;
		const last_name = doc.last_name;
		const response = await frappe.db.get_value("Customer", customer,
			["customer_name", "first_name", "last_name"]);
		const data = response.message;
		if (!data || frm.doc !== doc || doc.custom_customers !== customer) return;
		const parts = (data.customer_name || "").trim().split(/\s+/);
		const values = {};
		if (doc.first_name === first_name) values.first_name = data.first_name || parts[0] || "";
		if (doc.last_name === last_name) values.last_name = data.first_name ? (data.last_name || "") : parts.slice(1).join(" ");
		if (Object.keys(values).length) return frm.set_value(values);
	},
});
