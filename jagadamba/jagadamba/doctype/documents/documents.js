frappe.ui.form.on("Documents", {
	refresh(frm) {
		frm.set_query("item", function () {
			let filters = { item_group: "Finished Items", disabled: 0 };
			if (frm.doc.type) filters.custom_types = frm.doc.type;
			return { filters: filters };
		});
		frm.set_query("vehicle_type", function () {
			let filters = { item_group: "Finished Items", disabled: 0, custom_parent_item: 1 };
			if (frm.doc.type && frm.doc.type !== "Oil & Gas") filters.custom_types = frm.doc.type;
			return { filters: filters };
		});
		frm.set_query("oil_gas_item", function () {
			return { filters: { item_group: "Finished Items", disabled: 0, custom_types: "Oil & Gas" } };
		});

		if (!frm.is_new() && frm.doc.project) {
			const needsType = !frm.doc.type;
			const needsVehicle = !frm.doc.vehicle_type && !frm.doc.oil_gas_item;
			const needsItem = !frm.doc.item;
			if (needsType || needsVehicle || needsItem) {
				frappe.db.get_value(
					"Project",
					frm.doc.project,
					["custom_types", "custom_vehicle_type", "oil_gas_item"],
					(r) => {
						if (!r) return;
						if (needsType && r.custom_types) frm.set_value("type", r.custom_types);
						if (needsVehicle) {
							if (r.custom_vehicle_type) frm.set_value("vehicle_type", r.custom_vehicle_type);
							if (r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
						}
						if (needsItem) {
							const finished_item = r.oil_gas_item || r.custom_vehicle_type || "";
							if (finished_item) frm.set_value("item", finished_item);
						}
					}
				);
			}
		}
	},

	project(frm) {
		if (!frm.doc.project) {
			frm.set_value("sales_order", "");
			frm.set_value("customer", "");
			frm.set_value("customer_name", "");
			frm.set_value("project_budget", "");
			frm.set_value("type", "");
			frm.set_value("vehicle_type", "");
			frm.set_value("oil_gas_item", "");
			frm.set_value("item", "");
			return;
		}
		frappe.db.get_value(
			"Project",
			frm.doc.project,
			["sales_order", "customer", "custom_types", "custom_vehicle_type", "oil_gas_item"],
			(r) => {
				if (!r) return;
				frm.set_value("sales_order", r.sales_order || "");
				frm.set_value("customer", r.customer || "");
				frm.set_value("type", r.custom_types || "");
				frm.set_value("vehicle_type", r.custom_vehicle_type || "");
				frm.set_value("oil_gas_item", r.oil_gas_item || "");
				const finished_item = r.oil_gas_item || r.custom_vehicle_type || "";
				if (finished_item) frm.set_value("item", finished_item);
			}
		);
		frappe.db.get_value(
			"Project Budget",
			{ project: frm.doc.project, docstatus: 1 },
			"name",
			(r) => {
				frm.set_value("project_budget", r?.name || "");
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

frappe.ui.form.on("Drawing Attachment", {
	drawing_attachments_add(frm, cdt, cdn) {
		const priority = ["Engineering Head", "Design Engineer", "Project Engineer", "Finance Manager", "Management"];
		const roles = frappe.user_roles || [];
		const role = priority.find(r => roles.includes(r)) || "";
		frappe.model.set_value(cdt, cdn, "role", role);
	},
});

