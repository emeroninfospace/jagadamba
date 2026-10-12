import frappe
from frappe.utils import getdate, nowdate, add_days, add_months, flt

from jagadamba.jagadamba.workspace_dashboard import require_legacy_administrator


@frappe.whitelist()
def get_sales_dashboard_data(period="this_month", date_from=None, date_to=None, company=None):
	require_legacy_administrator()
	company = company or _default_company()
	date_range = _resolve_period(period, date_from, date_to)

	data = {
		"period_label": date_range["label"],
		"company": company,
		"kpis": get_kpis(company, date_range),
		"funnel": get_funnel(company, date_range),
		"monthly_trend": get_monthly_trend(company),
		"vehicle_type_split": get_vehicle_type_split(company, date_range),
		"lead_source_split": get_lead_source_split(date_range),
		"quotation_status": get_quotation_status(company, date_range),
		"top_customers": get_top_customers(company, date_range),
		"recent_quotations": get_recent_quotations(company),
		"recent_sales_orders": get_recent_sales_orders(company),
		"lost_quotations": get_lost_quotations(company, date_range),
	}
	return data


def _default_company():
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		company = frappe.db.get_value("Company", {}, "name", order_by="creation asc")
	return company


def _resolve_period(period, date_from, date_to):
	today = getdate(nowdate())

	if period == "this_year":
		start, end, label = today.replace(month=1, day=1), today, "This Year"
	elif period == "last_month":
		first_this = today.replace(day=1)
		end = add_days(first_this, -1)
		start = end.replace(day=1)
		label = "Last Month"
	elif period == "custom" and date_from and date_to:
		start, end = getdate(date_from), getdate(date_to)
		label = "{0} to {1}".format(start, end)
	else:
		start, end, label = today.replace(day=1), today, "This Month"

	return {"start": start, "end": end, "label": label}


def get_kpis(company, date_range):
	total_leads = frappe.db.count(
		"Lead", {"creation": ["between", [date_range["start"], date_range["end"]]]}
	)

	quotations = frappe.db.sql(
		"""
		SELECT COUNT(*) AS cnt, IFNULL(SUM(grand_total), 0) AS total
		FROM `tabQuotation`
		WHERE company = %(company)s AND docstatus = 1
			AND transaction_date BETWEEN %(start)s AND %(end)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"]},
		as_dict=True,
	)[0]

	sales_orders = frappe.db.sql(
		"""
		SELECT COUNT(*) AS cnt, IFNULL(SUM(grand_total), 0) AS total
		FROM `tabSales Order`
		WHERE company = %(company)s AND docstatus = 1
			AND transaction_date BETWEEN %(start)s AND %(end)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"]},
		as_dict=True,
	)[0]

	open_quotations = frappe.db.count(
		"Quotation",
		{"company": company, "docstatus": 1, "status": ["in", ["Draft", "Open", "Replied"]]},
	)

	conversion_rate = round((sales_orders.cnt / quotations.cnt * 100), 1) if quotations.cnt else 0
	avg_deal_size = round(sales_orders.total / sales_orders.cnt, 0) if sales_orders.cnt else 0

	return {
		"total_leads": total_leads,
		"quotation_count": quotations.cnt,
		"quotation_value": quotations.total,
		"sales_order_count": sales_orders.cnt,
		"sales_order_value": sales_orders.total,
		"conversion_rate": conversion_rate,
		"avg_deal_size": avg_deal_size,
		"open_quotations": open_quotations,
	}


def get_funnel(company, date_range):
	leads = frappe.db.count("Lead", {"creation": ["between", [date_range["start"], date_range["end"]]]})
	quotations = frappe.db.count(
		"Quotation",
		{
			"company": company,
			"docstatus": 1,
			"transaction_date": ["between", [date_range["start"], date_range["end"]]],
		},
	)
	sales_orders = frappe.db.count(
		"Sales Order",
		{
			"company": company,
			"docstatus": 1,
			"transaction_date": ["between", [date_range["start"], date_range["end"]]],
		},
	)
	invoiced = frappe.db.count(
		"Sales Invoice",
		{
			"company": company,
			"docstatus": 1,
			"posting_date": ["between", [date_range["start"], date_range["end"]]],
		},
	)
	return [
		{"stage": "Leads", "count": leads},
		{"stage": "Quotations", "count": quotations},
		{"stage": "Sales Orders", "count": sales_orders},
		{"stage": "Invoiced", "count": invoiced},
	]


def get_monthly_trend(company, months=6):
	today = getdate(nowdate())
	result = []
	for i in range(months - 1, -1, -1):
		month_date = add_months(today.replace(day=1), -i)
		start = month_date.replace(day=1)
		next_month = add_months(start, 1)
		end = add_days(next_month, -1)

		q_total = frappe.db.sql(
			"""
			SELECT IFNULL(SUM(grand_total), 0) FROM `tabQuotation`
			WHERE company = %s AND docstatus = 1 AND transaction_date BETWEEN %s AND %s
			""",
			(company, start, end),
		)[0][0] or 0

		so_total = frappe.db.sql(
			"""
			SELECT IFNULL(SUM(grand_total), 0) FROM `tabSales Order`
			WHERE company = %s AND docstatus = 1 AND transaction_date BETWEEN %s AND %s
			""",
			(company, start, end),
		)[0][0] or 0

		result.append({"month": start.strftime("%b %y"), "quotation": q_total, "sales_order": so_total})
	return result


def get_vehicle_type_split(company, date_range):
	# Sales Order has no vehicle type of its own — join through the linked Quotation
	return frappe.db.sql(
		"""
		SELECT
			IFNULL(vt.vehicle_type_name, 'Unassigned') AS vehicle_type,
			COUNT(so.name) AS count,
			IFNULL(SUM(so.grand_total), 0) AS total
		FROM `tabSales Order` so
		LEFT JOIN `tabQuotation` q ON q.name = so.custom_quotation
		LEFT JOIN `tabVehicle Type` vt ON vt.name = q.custom_vehicle_type
		WHERE so.company = %(company)s AND so.docstatus = 1
			AND so.transaction_date BETWEEN %(start)s AND %(end)s
		GROUP BY q.custom_vehicle_type
		ORDER BY total DESC
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"]},
		as_dict=True,
	)


def get_lead_source_split(date_range):
	return frappe.db.sql(
		"""
		SELECT IFNULL(source, 'Unknown') AS source, COUNT(*) AS count
		FROM `tabLead`
		WHERE creation BETWEEN %s AND %s
		GROUP BY source
		ORDER BY count DESC
		""",
		(date_range["start"], date_range["end"]),
		as_dict=True,
	)


def get_quotation_status(company, date_range):
	return frappe.db.sql(
		"""
		SELECT IFNULL(status, 'Draft') AS status, COUNT(*) AS count
		FROM `tabQuotation`
		WHERE company = %s AND docstatus != 2
			AND transaction_date BETWEEN %s AND %s
		GROUP BY status
		ORDER BY count DESC
		""",
		(company, date_range["start"], date_range["end"]),
		as_dict=True,
	)


def get_top_customers(company, date_range, limit=6):
	return frappe.db.sql(
		"""
		SELECT customer, customer_name, SUM(grand_total) AS total, COUNT(*) AS count
		FROM `tabSales Order`
		WHERE company = %(company)s AND docstatus = 1
			AND transaction_date BETWEEN %(start)s AND %(end)s
		GROUP BY customer
		ORDER BY total DESC
		LIMIT %(limit)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"], "limit": limit},
		as_dict=True,
	)


def get_recent_quotations(company, limit=8):
	return frappe.db.get_all(
		"Quotation",
		filters={"company": company, "docstatus": ["!=", 2]},
		fields=["name", "customer_name", "status", "custom_vehicle_type", "transaction_date", "grand_total"],
		order_by="transaction_date desc",
		limit_page_length=limit,
	)


def get_recent_sales_orders(company, limit=8):
	return frappe.db.get_all(
		"Sales Order",
		filters={"company": company, "docstatus": 1},
		fields=["name", "customer_name", "status", "transaction_date", "grand_total", "project"],
		order_by="transaction_date desc",
		limit_page_length=limit,
	)


def get_lost_quotations(company, date_range, limit=8):
	return frappe.db.get_all(
		"Quotation",
		filters={
			"company": company,
			"status": "Lost",
			"transaction_date": ["between", [date_range["start"], date_range["end"]]],
		},
		fields=["name", "customer_name", "transaction_date", "grand_total", "order_lost_reason"],
		order_by="transaction_date desc",
		limit_page_length=limit,
	)
