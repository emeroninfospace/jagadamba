// Item Group tree: show each group's Item Code Prefix before its name, e.g. "401010 - MS Sheet & Plate".
frappe.treeview_settings["Item Group"] = Object.assign(frappe.treeview_settings["Item Group"] || {}, {
	get_tree_nodes: "jagadamba.jagadamba.item_code.get_item_group_tree_nodes",
});
