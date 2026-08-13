import json
import frappe


@frappe.whitelist()
def make_purchase_order(sales_order):
	so = frappe.get_doc("Sales Order", sales_order)

	selected_items = json.dumps(
		[
			{
				"item_code": d.item_code,
				"item_name": d.item_name,
				"description": d.description or "",
				"qty": d.qty - flt(d.ordered_qty),
				"rate": d.rate,
				"warehouse": d.warehouse,
				"uom": d.uom,
				"conversion_factor": d.conversion_factor or 1,
			}
			for d in so.items
			if (d.qty - flt(d.ordered_qty)) > 0
		]
	)

	from erpnext.selling.doctype.sales_order.sales_order import (
		make_purchase_order as erpnext_make_po,
	)

	return erpnext_make_po(source_name=sales_order, selected_items=selected_items)


from frappe.utils import flt
