frappe.ui.form.on("Work Order", {
	refresh(frm) {
		const needsCustom = !frm.doc.custom_types || (!frm.doc.custom_vehicle_type && !frm.doc.oil_gas_item);
		if (!needsCustom) return;

		// Fetch from project if set
		if (frm.doc.project) {
			frappe.db.get_value("Project", frm.doc.project,
				["custom_types", "custom_vehicle_type", "oil_gas_item"], (r) => {
					if (!r) return;
					if (!frm.doc.custom_types && r.custom_types) frm.set_value("custom_types", r.custom_types);
					if (!frm.doc.custom_vehicle_type && r.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
					if (!frm.doc.oil_gas_item && r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
				}
			);
			return;
		}

		// Fallback: fetch from BOM
		if (frm.doc.bom_no) {
			frappe.db.get_value("BOM", frm.doc.bom_no,
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

	bom_no(frm) {
		if (!frm.doc.bom_no || frm.doc.project) return;
		frappe.db.get_value("BOM", frm.doc.bom_no,
			["custom_types", "custom_vehicle_type", "oil_gas_item"], (r) => {
				if (!r) return;
				if (r.custom_types) frm.set_value("custom_types", r.custom_types);
				if (r.custom_vehicle_type) frm.set_value("custom_vehicle_type", r.custom_vehicle_type);
				if (r.oil_gas_item) frm.set_value("oil_gas_item", r.oil_gas_item);
			}
		);
	},
});
