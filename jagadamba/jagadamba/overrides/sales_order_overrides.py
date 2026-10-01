from frappe.utils import flt


def validate(doc, _method=None):
	_calculate_oil_gas_pricing(doc)


def _calculate_oil_gas_pricing(doc):
	if (doc.get("custom_types") or "") != "Oil & Gas":
		return

	sale_value = flt(doc.get("custom_sale_value_without_tax"))
	vat_pct = flt(doc.get("custom_vat_percent"))
	tax_pct = flt(doc.get("custom_tax_percent"))
	net_total = flt(doc.get("net_total"))

	vat_amount = sale_value * vat_pct / 100
	tax_amount = (sale_value + vat_amount) * tax_pct / 100

	doc.custom_vat_amount = vat_amount
	doc.custom_tax_amount = tax_amount
	doc.custom_total_quoted_value = sale_value + vat_amount + tax_amount
	doc.custom_net_profit = sale_value - net_total
