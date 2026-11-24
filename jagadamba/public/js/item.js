// Trailers items (Type with Auto Item Code) follow the store classification:
// Material Category > Mat Group > Mat Sub-Group (the Item Group), and their code is generated
// on save from the sub-group's Item Code Prefix plus a running number.

frappe.ui.form.on("Item", {
	setup(frm) {
		const query = "jagadamba.jagadamba.item_code.classification_query";
		frm.set_query("custom_material_category", () => ({ query, filters: { level: "category" } }));
		frm.set_query("custom_mat_group", () => ({
			query, filters: { level: "group", parent: frm.doc.custom_material_category || "" },
		}));
		frm.set_query("custom_design_item", () => ({
			filters: [["Item", "disabled", "=", 0], ["Item", "name", "!=", frm.doc.name]],
		}));
		frm.set_query("item_group", () => frm.doc.custom_auto_item_code
			? { query, filters: { level: "sub_group", parent: frm.doc.custom_mat_group || "" } }
			: { filters: [["Item Group", "docstatus", "!=", 2]] });
	},

	refresh(frm) {
		show_classification_labels(frm);
		return show_item_code_rule(frm);
	},

	custom_types(frm) { return show_item_code_rule(frm); },
	custom_auto_item_code(frm) {
		show_classification_labels(frm);
		return show_item_code_rule(frm);
	},

	async custom_material_category(frm) {
		const group = frm.doc.custom_mat_group;
		if (group && await parent_of(group) !== frm.doc.custom_material_category) {
			await frm.set_value("custom_mat_group", "");
		}
	},

	async custom_mat_group(frm) {
		const group = frm.doc.custom_mat_group;
		if (!group) {
			if (frm.doc.custom_auto_item_code && frm.doc.item_group) await frm.set_value("item_group", "");
			return;
		}
		const category = await parent_of(group);
		if (frm.doc.custom_mat_group !== group) return;
		if (category && frm.doc.custom_material_category !== category) {
			await frm.set_value("custom_material_category", category);
		}
		if (frm.doc.item_group && await parent_of(frm.doc.item_group) !== group) {
			await frm.set_value("item_group", "");
		}
	},

	async item_group(frm) {
		const sub_group = frm.doc.item_group;
		if (frm.doc.custom_auto_item_code && sub_group) {
			const group = await parent_of(sub_group);
			if (frm.doc.item_group === sub_group && group && frm.doc.custom_mat_group !== group) {
				await frm.set_value("custom_mat_group", group);
			}
		}
		return show_item_code_rule(frm);
	},
});

async function parent_of(item_group) {
	const response = await frappe.db.get_value("Item Group", item_group, "parent_item_group");
	return response && response.message ? response.message.parent_item_group : null;
}

function show_classification_labels(frm) {
	frm.set_df_property("item_group", "label",
		frm.doc.custom_auto_item_code ? __("Mat Sub-Group Description") : __("Item Group"));
}

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
