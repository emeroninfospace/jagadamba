frappe.ui.form.on("BOM", {
	refresh: function (frm) {
		if (frm.doc.docstatus === 0 || (frm.doc.docstatus === 1 && frm.doc.is_active)) {
			frm.add_custom_button(
				__("Material Request"),
				function () {
					frappe.call({
						method: "jagadamba.jagadamba.api.create_material_request_from_bom",
						args: { bom: frm.doc.name },
						freeze: true,
						freeze_message: __("Creating Material Request..."),
						callback: function (r) {
							if (r.message) {
								var doc = frappe.model.sync(r.message);
								frappe.set_route("Form", "Material Request", doc[0].name);
							}
						},
					});
				},
				__("Create")
			);
		}
	},
});
