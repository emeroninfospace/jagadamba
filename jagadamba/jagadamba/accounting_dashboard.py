import frappe
from frappe.utils import getdate, nowdate, add_days, add_months, flt, fmt_money

from jagadamba.jagadamba.workspace_dashboard import require_legacy_administrator


@frappe.whitelist()
def get_accounting_dashboard_data(period="this_month", date_from=None, date_to=None, company=None):
	require_legacy_administrator()
	company = company or _default_company()
	date_range = _resolve_acct_period(period, date_from, date_to)

	data = {
		"period_label": date_range["label"],
		"company": company,
		"kpis": get_kpis(company, date_range),
		"monthly_trend": get_monthly_trend(company),
		"expense_by_category": get_expense_by_category(company, date_range),
		"income_by_category": get_income_by_category(company, date_range),
		"receivable_aging": get_aging("Sales Invoice", company),
		"payable_aging": get_aging("Purchase Invoice", company),
		"top_customers": get_top_customers(company, date_range),
		"top_suppliers": get_top_suppliers(company, date_range),
		"bank_cash_accounts": get_bank_cash_accounts(company),
		"overdue_receivables": get_overdue_invoices("Sales Invoice", company),
		"overdue_payables": get_overdue_invoices("Purchase Invoice", company),
	}
	return data


def _default_company():
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		company = frappe.db.get_value("Company", {}, "name", order_by="creation asc")
	return company


def _resolve_acct_period(period, date_from, date_to):
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
	filters_gl = {
		"company": company,
		"is_cancelled": 0,
		"posting_date": ["between", [date_range["start"], date_range["end"]]],
	}

	revenue = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(gle.credit - gle.debit), 0)
		FROM `tabGL Entry` gle
		JOIN `tabAccount` acc ON acc.name = gle.account
		WHERE gle.company = %(company)s AND gle.is_cancelled = 0
			AND acc.root_type = 'Income'
			AND gle.posting_date BETWEEN %(start)s AND %(end)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"]},
	)[0][0] or 0

	expense = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(gle.debit - gle.credit), 0)
		FROM `tabGL Entry` gle
		JOIN `tabAccount` acc ON acc.name = gle.account
		WHERE gle.company = %(company)s AND gle.is_cancelled = 0
			AND acc.root_type = 'Expense'
			AND gle.posting_date BETWEEN %(start)s AND %(end)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"]},
	)[0][0] or 0

	receivable = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(outstanding_amount), 0) FROM `tabSales Invoice`
		WHERE company = %s AND docstatus = 1 AND outstanding_amount > 0
		""",
		(company,),
	)[0][0] or 0

	payable = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(outstanding_amount), 0) FROM `tabPurchase Invoice`
		WHERE company = %s AND docstatus = 1 AND outstanding_amount > 0
		""",
		(company,),
	)[0][0] or 0

	bank_cash = frappe.db.sql(
		"""
		SELECT IFNULL(SUM(gle.debit - gle.credit), 0)
		FROM `tabGL Entry` gle
		JOIN `tabAccount` acc ON acc.name = gle.account
		WHERE gle.company = %s AND gle.is_cancelled = 0
			AND acc.account_type IN ('Bank', 'Cash')
		""",
		(company,),
	)[0][0] or 0

	overdue_receivable_count = frappe.db.count(
		"Sales Invoice",
		{"company": company, "docstatus": 1, "outstanding_amount": [">", 0], "due_date": ["<", nowdate()]},
	)
	overdue_payable_count = frappe.db.count(
		"Purchase Invoice",
		{"company": company, "docstatus": 1, "outstanding_amount": [">", 0], "due_date": ["<", nowdate()]},
	)

	net_profit = flt(revenue) - flt(expense)
	margin = round((net_profit / revenue * 100), 1) if revenue else 0

	return {
		"total_revenue": revenue,
		"total_expense": expense,
		"net_profit": net_profit,
		"margin_pct": margin,
		"bank_cash_balance": bank_cash,
		"accounts_receivable": receivable,
		"accounts_payable": payable,
		"overdue_receivable_count": overdue_receivable_count,
		"overdue_payable_count": overdue_payable_count,
	}


def get_monthly_trend(company, months=6):
	today = getdate(nowdate())
	result = []
	for i in range(months - 1, -1, -1):
		month_date = add_months(today.replace(day=1), -i)
		start = month_date.replace(day=1)
		next_month = add_months(start, 1)
		end = add_days(next_month, -1)

		income = frappe.db.sql(
			"""
			SELECT IFNULL(SUM(gle.credit - gle.debit), 0)
			FROM `tabGL Entry` gle
			JOIN `tabAccount` acc ON acc.name = gle.account
			WHERE gle.company = %(company)s AND gle.is_cancelled = 0
				AND acc.root_type = 'Income'
				AND gle.posting_date BETWEEN %(start)s AND %(end)s
			""",
			{"company": company, "start": start, "end": end},
		)[0][0] or 0

		expense = frappe.db.sql(
			"""
			SELECT IFNULL(SUM(gle.debit - gle.credit), 0)
			FROM `tabGL Entry` gle
			JOIN `tabAccount` acc ON acc.name = gle.account
			WHERE gle.company = %(company)s AND gle.is_cancelled = 0
				AND acc.root_type = 'Expense'
				AND gle.posting_date BETWEEN %(start)s AND %(end)s
			""",
			{"company": company, "start": start, "end": end},
		)[0][0] or 0

		result.append(
			{
				"month": start.strftime("%b %y"),
				"income": income,
				"expense": expense,
			}
		)
	return result


def get_expense_by_category(company, date_range, limit=6):
	return frappe.db.sql(
		"""
		SELECT acc.name AS account, acc.account_name,
			SUM(gle.debit - gle.credit) AS total
		FROM `tabGL Entry` gle
		JOIN `tabAccount` acc ON acc.name = gle.account
		WHERE gle.company = %(company)s AND gle.is_cancelled = 0
			AND acc.root_type = 'Expense'
			AND gle.posting_date BETWEEN %(start)s AND %(end)s
		GROUP BY gle.account
		HAVING total > 0
		ORDER BY total DESC
		LIMIT %(limit)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"], "limit": limit},
		as_dict=True,
	)


def get_income_by_category(company, date_range, limit=6):
	return frappe.db.sql(
		"""
		SELECT acc.name AS account, acc.account_name,
			SUM(gle.credit - gle.debit) AS total
		FROM `tabGL Entry` gle
		JOIN `tabAccount` acc ON acc.name = gle.account
		WHERE gle.company = %(company)s AND gle.is_cancelled = 0
			AND acc.root_type = 'Income'
			AND gle.posting_date BETWEEN %(start)s AND %(end)s
		GROUP BY gle.account
		HAVING total > 0
		ORDER BY total DESC
		LIMIT %(limit)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"], "limit": limit},
		as_dict=True,
	)


def get_aging(doctype, company):
	today = getdate(nowdate())
	rows = frappe.db.sql(
		"""
		SELECT name, due_date, outstanding_amount
		FROM `tab{doctype}`
		WHERE company = %s AND docstatus = 1 AND outstanding_amount > 0
		""".format(doctype=doctype),
		(company,),
		as_dict=True,
	)

	buckets = {"0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, "not_due": 0}
	for r in rows:
		if not r.due_date or getdate(r.due_date) >= today:
			buckets["not_due"] += flt(r.outstanding_amount)
			continue
		days = (today - getdate(r.due_date)).days
		if days <= 30:
			buckets["0-30"] += flt(r.outstanding_amount)
		elif days <= 60:
			buckets["31-60"] += flt(r.outstanding_amount)
		elif days <= 90:
			buckets["61-90"] += flt(r.outstanding_amount)
		else:
			buckets["90+"] += flt(r.outstanding_amount)
	return buckets


def get_top_customers(company, date_range, limit=6):
	return frappe.db.sql(
		"""
		SELECT customer, customer_name, SUM(grand_total) AS total, COUNT(*) AS count
		FROM `tabSales Invoice`
		WHERE company = %(company)s AND docstatus = 1
			AND posting_date BETWEEN %(start)s AND %(end)s
		GROUP BY customer
		ORDER BY total DESC
		LIMIT %(limit)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"], "limit": limit},
		as_dict=True,
	)


def get_top_suppliers(company, date_range, limit=6):
	return frappe.db.sql(
		"""
		SELECT supplier, supplier_name, SUM(grand_total) AS total, COUNT(*) AS count
		FROM `tabPurchase Invoice`
		WHERE company = %(company)s AND docstatus = 1
			AND posting_date BETWEEN %(start)s AND %(end)s
		GROUP BY supplier
		ORDER BY total DESC
		LIMIT %(limit)s
		""",
		{"company": company, "start": date_range["start"], "end": date_range["end"], "limit": limit},
		as_dict=True,
	)


def get_bank_cash_accounts(company):
	accounts = frappe.db.get_all(
		"Account",
		filters={"company": company, "account_type": ["in", ["Bank", "Cash"]], "is_group": 0},
		fields=["name", "account_name", "account_type"],
	)
	result = []
	for a in accounts:
		balance = frappe.db.sql(
			"""
			SELECT IFNULL(SUM(debit - credit), 0) FROM `tabGL Entry`
			WHERE account = %s AND is_cancelled = 0
			""",
			(a.name,),
		)[0][0] or 0
		result.append(
			{
				"account": a.name,
				"account_name": a.account_name,
				"account_type": a.account_type,
				"balance": balance,
			}
		)
	result.sort(key=lambda x: x["balance"], reverse=True)
	return result


def get_overdue_invoices(doctype, company, limit=8):
	return frappe.db.sql(
		"""
		SELECT name,
			{party_field} AS party, {party_name_field} AS party_name,
			due_date, outstanding_amount
		FROM `tab{doctype}`
		WHERE company = %s AND docstatus = 1 AND outstanding_amount > 0
			AND due_date < %s
		ORDER BY due_date ASC
		LIMIT %s
		""".format(
			doctype=doctype,
			party_field="customer" if doctype == "Sales Invoice" else "supplier",
			party_name_field="customer_name" if doctype == "Sales Invoice" else "supplier_name",
		),
		(company, nowdate(), limit),
		as_dict=True,
	)
