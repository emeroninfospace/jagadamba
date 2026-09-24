frappe.ui.form.on("Purchase Order", {
	refresh(frm) {
		const needsProject = !frm.doc.project;
		const needsCustom = !frm.doc.custom_types || (!frm.doc.custom_vehicle_type && !frm.doc.oil_gas_item);

		if (!needsProject && !needsCustom) return;

		const items = frm.doc.items || [];

		if (needsProject) {
			const itemProject = (items.find(i => i.project) || {}).project;
			if (itemProject) frm.set_value("project", itemProject);
		}

		if (needsCustom) {
			const mr = (items.find(i => i.material_request) || {}).material_request;
			if (mr) {
				frappe.db.get_value("Material Request", mr,
					["custom_types", "custom_vehicle_type", "oil_gas_item"], (r) => {
						if (!r) return;
						if (!frm.doc.custom_types && r.custom_types) frm.set_value("custom_types", r.custom_types);
						if (!frm.doc.custom_vehicle_type && r.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
						if (!frm.doc.oil_gas_item && r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
					}
				);
				return;
			}
		}

		if (frm.doc.project && needsCustom) {
			frappe.db.get_value("Project", frm.doc.project,
				["custom_types", "custom_vehicle_type", "oil_gas_item"], (r) => {
					if (!r) return;
					if (!frm.doc.custom_types && r.custom_types) frm.set_value("custom_types", r.custom_types);
					if (!frm.doc.custom_vehicle_type && r.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
					if (!frm.doc.oil_gas_item && r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
				}
			);
		}
	},

	project(frm) {
		if (!frm.doc.project) return;
		frappe.db.get_value("Project", frm.doc.project,
			["custom_types", "custom_vehicle_type", "oil_gas_item"], (r) => {
				if (!r) return;
				if (r.custom_types) frm.set_value("custom_types", r.custom_types);
				if (r.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
				if (r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
			}
		);
	},
});
