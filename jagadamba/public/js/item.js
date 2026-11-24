// For a Type with Auto Item Code (Trailers) in an Item Group with an Item Code Prefix,
// the code is generated on save (prefix + running number).
frappe.ui.form.on("Item", {
	refresh(frm) { return show_item_code_rule(frm); },
	item_group(frm) { return show_item_code_rule(frm); },
	custom_types(frm) { return show_item_code_rule(frm); },
});

async function show_item_code_rule(frm) {
	if (!frm.is_new()) return;
	const doc = frm.doc;
	const group = doc.item_group;
	const type = doc.custom_types;
	const response = group && type ? await frappe.call({
		method: "jagadamba.jagadamba.item_code.get_item_code_preview",
		args: { item_group: group, item_type: type },
	}) : null;
	if (frm.doc !== doc || doc.item_group !== group || doc.custom_types !== type) return;
	const preview = response && response.message;
	frm.toggle_reqd("item_code", !preview);
	frm.set_df_property("item_code", "read_only", preview ? 1 : 0);
	frm.set_df_property("item_code", "description",
		preview ? __("Generated on save. Next: {0}", [preview.next]) : "");
	if (preview && doc.item_code) await frm.set_value("item_code", "");
}
