"""Internal estimate costing; ERPNext's sales lines and accounting taxes stay authoritative."""
import math

import frappe
from frappe.utils import flt


def _precision(doc, fieldname):
	return doc.precision(fieldname)


def _number(value, label):
	try:
		number = float(value or 0)
	except (ValueError, TypeError):
		frappe.throw(frappe._("{0} must be a number.").format(label))
	if not math.isfinite(number):
		frappe.throw(frappe._("{0} must be a finite number.").format(label))
	return number


def calculate_oil_gas_pricing(doc):
	"""Keep the hook API stable; eligibility comes from Type, never its display name."""
	if not doc.get("custom_enable_estimation"):
		return

	rows = doc.get("custom_estimation_items") or []
	basis = doc.get("custom_estimation_cost_source")
	if not basis:
		basis = "Estimation" if rows or (doc.doctype == "Quotation" and doc.is_new()) else "Document Net Total"
		doc.custom_estimation_cost_source = basis
	if basis not in ("Estimation", "Document Net Total"):
		frappe.throw(frappe._("Select a valid Cost Basis."))

	if doc.doctype == "Quotation":
		if rows:
			# Cost Basis is hidden on Quotation: entered cost lines always drive the estimate.
			basis = doc.custom_estimation_cost_source = "Estimation"
		total = 0
		for row in rows:
			qty = _number(row.qty, frappe._("Quantity"))
			rate = _number(row.rate, frappe._("Unit Cost"))
			if qty < 0 or rate < 0:
				frappe.throw(frappe._("Estimation quantity and unit cost cannot be negative."))
			row.amount = flt(qty * rate, _precision(row, "amount"))
			total += row.amount
	elif basis == "Estimation":
		# Read the current authorized source on save; do not trust a supplied read-only total.
		if not doc.get("custom_quotation"):
			frappe.throw(frappe._("Select a Quotation for the estimation cost, or use Document Net Total."))
		source = frappe.get_doc("Quotation", doc.custom_quotation)
		source.check_permission("read")
		if source.custom_types != doc.custom_types or source.docstatus == 2:
			frappe.throw(frappe._("Select a non-cancelled Quotation with the same Type."))
		if source.get("company") != doc.get("company") or source.get("currency") != doc.get("currency"):
			frappe.throw(frappe._("The estimation Quotation must use the same Company and Currency as the Sales Order."))
		total = flt(source.custom_total_estimated_value)
	else:
		total = 0

	cost = total if basis == "Estimation" else flt(doc.get("net_total"))
	doc.custom_total_estimated_value = flt(cost, _precision(doc, "custom_total_estimated_value"))
	sale = _number(doc.get("custom_sale_value_without_tax"), frappe._("Sale Value"))
	vat_percent = _number(doc.get("custom_vat_percent"), frappe._("VAT %"))
	tax_percent = _number(doc.get("custom_tax_percent"), frappe._("Tax %"))
	if not 0 <= vat_percent <= 100 or not 0 <= tax_percent <= 100:
		frappe.throw(frappe._("VAT and Tax percentages must be between 0 and 100."))
	tax_basis = doc.get("custom_tax_basis") or "Sale Value + VAT"
	if tax_basis not in ("Sale Value", "Sale Value + VAT"):
		frappe.throw(frappe._("Select a valid Tax Basis."))
	doc.custom_tax_basis = tax_basis
	vat = flt(sale * vat_percent / 100, _precision(doc, "custom_vat_amount"))
	tax_base = sale + vat if tax_basis == "Sale Value + VAT" else sale
	tax = flt(tax_base * tax_percent / 100, _precision(doc, "custom_tax_amount"))
	doc.custom_vat_amount = vat
	doc.custom_tax_amount = tax
	doc.custom_total_quoted_value = flt(sale + vat + tax, _precision(doc, "custom_total_quoted_value"))
	doc.custom_net_profit = flt(sale - doc.custom_total_estimated_value, _precision(doc, "custom_net_profit"))
