function set_vehicle_type_query(frm) {
	frm.set_query("custom_vehicle_type", function () {
		const filters = { disabled: 0, item_group: "Finished Items" };
		if (frm.doc.custom_types) filters.custom_types = frm.doc.custom_types;
		if (frm.doc.company) filters.custom_company = frm.doc.company;
		return { filters: filters };
	});
}

function set_oil_gas_item_query(frm) {
	frm.set_query("oil_gas_item", function () {
		const filters = { item_group: "Finished Items", disabled: 0, custom_types: "Oil & Gas" };
		if (frm.doc.company) filters.custom_company = frm.doc.company;
		return { filters: filters };
	});
}

async function make_opportunity_direct(frm) {
	await frm.reload_doc();

	const prospect_name =
		frm.doc.company_name ||
		[frm.doc.first_name, frm.doc.last_name].filter(Boolean).join(" ").trim() ||
		frm.doc.lead_name ||
		frm.doc.name;

	const existing_prospect = (
		await frappe.db.get_value("Prospect Lead", { lead: frm.doc.name }, "name", null, "Prospect")
	).message?.name;

	const existing_contact = (
		await frappe.db.get_value("Contact", {
			first_name: frm.doc.first_name || frm.doc.lead_name,
			last_name: frm.doc.last_name || "",
		}, "name")
	).message?.name;

	const need_prospect = !existing_prospect;
	const need_contact = !existing_contact;

	const open_opportunity = () => {
		frappe.model.open_mapped_doc({
			method: "erpnext.crm.doctype.lead.lead.make_opportunity",
			frm: frm,
		});
	};

	if (!need_prospect && !need_contact) {
		open_opportunity();
		return;
	}

	frappe.call({
		method: "create_prospect_and_contact",
		doc: frm.doc,
		args: {
			data: {
				create_prospect: need_prospect ? 1 : 0,
				prospect_name: prospect_name,
				create_contact: need_contact ? 1 : 0,
			},
		},
		freeze: true,
		freeze_message: __("Preparing Opportunity..."),
		callback(r) {
			if (!r.exc) open_opportunity();
		},
	});
}

frappe.ui.form.on("Lead", {
	refresh: function (frm) {
		set_vehicle_type_query(frm);
		set_oil_gas_item_query(frm);

		setTimeout(() => {
			frm.remove_custom_button("Prospect", "Create");
			frm.remove_custom_button("Add to Prospect", "Action");
			frm.remove_custom_button("Opportunity", "Create");
			if (!frm.is_new()) {
				frm.add_custom_button(__("Opportunity"), () => make_opportunity_direct(frm), __("Create"));
			}
		}, 100);
	},

	custom_types: function (frm) {
		frm.set_value("custom_vehicle_type", "");
		frm.set_value("oil_gas_item", "");
		set_vehicle_type_query(frm);
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
