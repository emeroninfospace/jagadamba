frappe.ui.form.on("Purchase Order", {
	refresh(frm) {
		if (frm.doc.docstatus !== 0) return;
		const items = frm.doc.items || [];
		if (!frm.doc.project) {
			const item_project = (items.find(i => i.project) || {}).project;
			if (item_project) frm.set_value("project", item_project);
		}

		// Type comes from the Material Request the items were raised from, else from the Project.
		const material_request = (items.find(i => i.material_request) || {}).material_request;
		if (material_request) {
			return jagadamba.sales_flow.inherit_type(frm, "Material Request", material_request);
		}
		return jagadamba.sales_flow.inherit_type(frm, "Project", frm.doc.project);
	},

	project(frm) {
		return jagadamba.sales_flow.inherit_type(frm, "Project", frm.doc.project, true);
	},
});
