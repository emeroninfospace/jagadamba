"""Shared custom Oil & Gas pricing; preserve the existing compound-tax formula."""
from frappe.utils import flt


def calculate_oil_gas_pricing(doc):
	if doc.get("custom_types") != "Oil & Gas":
		return

	sale_value = flt(doc.get("custom_sale_value_without_tax"))
	vat_amount = sale_value * flt(doc.get("custom_vat_percent")) / 100
	tax_amount = (sale_value + vat_amount) * flt(doc.get("custom_tax_percent")) / 100
	doc.custom_vat_amount = vat_amount
	doc.custom_tax_amount = tax_amount
	doc.custom_total_quoted_value = sale_value + vat_amount + tax_amount
	doc.custom_net_profit = sale_value - flt(doc.get("net_total"))
