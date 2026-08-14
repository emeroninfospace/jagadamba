import json
import frappe
from frappe.utils import flt


@frappe.whitelist()
def make_purchase_order(sales_order):
	so = frappe.get_doc("Sales Order", sales_order)
	child_items = so.custom_item_groups

	if not child_items:
		frappe.throw(
			"No items found in Build Categories. Please select parent items in the Sales Order first."
		)

	po = frappe.new_doc("Purchase Order")
	po.company = so.company
	po.project = so.project
	po.transaction_date = frappe.utils.today()
	po.schedule_date = frappe.utils.today()

	for ci in child_items:
		uom = ci.uom or frappe.db.get_value("Item", ci.item_code, "stock_uom") or "Nos"
		po.append(
			"items",
			{
				"item_code": ci.item_code,
				"item_name": ci.item_name,
				"qty": 1,
				"uom": uom,
				"stock_uom": uom,
				"conversion_factor": 1,
				"schedule_date": frappe.utils.today(),
			},
		)

	return po


@frappe.whitelist()
def create_project(project_name, customer=None, sales_order=None):
	project = frappe.get_doc({
		"doctype": "Project",
		"project_name": project_name,
		"customer": customer or "",
	})
	project.insert(ignore_permissions=True)

	if sales_order:
		frappe.db.set_value("Sales Order", sales_order, "project", project.name)

	return project.name


@frappe.whitelist()
def get_po_items_for_designing(project):
	po_items = frappe.db.sql(
		"""
		SELECT poi.item_code, poi.item_name, poi.qty, poi.uom, poi.description
		FROM `tabPurchase Order Item` poi
		JOIN `tabPurchase Order` po ON po.name = poi.parent
		WHERE po.project = %s AND po.docstatus = 1
		""",
		(project,),
		as_dict=True,
	)
	return po_items


@frappe.whitelist()
def create_bom_from_designing(designing):
	doc = frappe.get_doc("Designing", designing)
	if not doc.item:
		frappe.throw("Please set the Item field before creating a BOM.")

	bom = frappe.new_doc("BOM")
	bom.item = doc.item
	bom.project = doc.project
	bom.quantity = 1

	for rm in doc.raw_materials:
		uom = rm.uom or frappe.db.get_value("Item", rm.item_code, "stock_uom") or "Nos"
		bom.append(
			"items",
			{
				"item_code": rm.item_code,
				"item_name": rm.item_name,
				"qty": rm.qty or 1,
				"uom": uom,
				"stock_uom": uom,
				"description": rm.description,
			},
		)

	return bom


@frappe.whitelist()
def get_child_items_for_parent_items(parent_item_codes):
	if isinstance(parent_item_codes, str):
		parent_item_codes = json.loads(parent_item_codes)

	result = []
	for parent_code in parent_item_codes:
		parent_doc = frappe.get_doc("Item", parent_code)
		item_group = parent_doc.item_group

		child_items = frappe.db.sql(
			"""
			SELECT item_code, item_name, stock_uom
			FROM `tabItem`
			WHERE item_group = %s
			  AND IFNULL(custom_parent_item, 0) = 0
			  AND disabled = 0
			  AND item_code != %s
			""",
			(item_group, parent_code),
			as_dict=True,
		)
		for ci in child_items:
			result.append(
				{
					"parent_item": parent_code,
					"item_code": ci.item_code,
					"item_name": ci.item_name,
					"uom": ci.stock_uom,
				}
			)

	return result
