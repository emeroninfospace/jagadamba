"""Sales Order profit and tax summary; ERPNext's sales lines and accounting taxes stay authoritative."""
import math

import frappe
from frappe.utils import flt


def _number(value, label):
	try:
		number = float(value or 0)
	except (ValueError, TypeError):
		frappe.throw(frappe._("{0} must be a number.").format(label))
	if not math.isfinite(number):
		frappe.throw(frappe._("{0} must be a finite number.").format(label))
	return number


def calculate_oil_gas_pricing(doc):
	"""Eligibility comes from the Type configuration, never the Type's display name."""
	if not doc.get("custom_enable_estimation"):
		return

	precision = doc.precision
	doc.custom_total_estimated_value = flt(doc.get("net_total"), precision("custom_total_estimated_value"))
	sale = _number(doc.get("custom_sale_value_without_tax"), frappe._("Sale Value"))
	vat_percent = _number(doc.get("custom_vat_percent"), frappe._("VAT %"))
	tax_percent = _number(doc.get("custom_tax_percent"), frappe._("Tax %"))
	if not 0 <= vat_percent <= 100 or not 0 <= tax_percent <= 100:
		frappe.throw(frappe._("VAT and Tax percentages must be between 0 and 100."))
	tax_basis = doc.get("custom_tax_basis") or "Sale Value + VAT"
	if tax_basis not in ("Sale Value", "Sale Value + VAT"):
		frappe.throw(frappe._("Select a valid Tax Basis."))
	doc.custom_tax_basis = tax_basis
	vat = flt(sale * vat_percent / 100, precision("custom_vat_amount"))
	tax_base = sale + vat if tax_basis == "Sale Value + VAT" else sale
	tax = flt(tax_base * tax_percent / 100, precision("custom_tax_amount"))
	doc.custom_vat_amount = vat
	doc.custom_tax_amount = tax
	doc.custom_total_quoted_value = flt(sale + vat + tax, precision("custom_total_quoted_value"))
	doc.custom_net_profit = flt(sale - doc.custom_total_estimated_value, precision("custom_net_profit"))
