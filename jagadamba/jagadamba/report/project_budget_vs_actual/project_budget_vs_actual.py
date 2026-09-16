import frappe
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	columns = get_columns()
	data, chart_data = get_data(filters)
	chart = get_chart(chart_data)
	summary = get_summary(chart_data)
	return columns, data, None, chart, summary


def get_columns():
	return [
		{
			"fieldname": "project",
			"label": "Project",
			"fieldtype": "Link",
			"options": "Project",
			"width": 140,
		},
		{
			"fieldname": "customer_name",
			"label": "Customer",
			"fieldtype": "Data",
			"width": 150,
		},
		{
			"fieldname": "project_budget",
			"label": "Project Budget",
			"fieldtype": "Link",
			"options": "Project Budget",
			"width": 140,
		},
		{
			"fieldname": "main_wbs",
			"label": "Main WBS",
			"fieldtype": "Data",
			"width": 130,
		},
		{
			"fieldname": "sub_wbs",
			"label": "Sub WBS",
			"fieldtype": "Data",
			"width": 130,
		},
		{
			"fieldname": "description",
			"label": "Description",
			"fieldtype": "Data",
			"width": 160,
		},
		{
			"fieldname": "budget_amount",
			"label": "Budgeted Amount",
			"fieldtype": "Currency",
			"width": 150,
		},
		{
			"fieldname": "actual_po",
			"label": "Actual (PO)",
			"fieldtype": "Currency",
			"width": 130,
		},
		{
			"fieldname": "actual_wo",
			"label": "Actual (Work Order)",
			"fieldtype": "Currency",
			"width": 140,
		},
		{
			"fieldname": "total_actual",
			"label": "Total Actual",
			"fieldtype": "Currency",
			"width": 130,
		},
		{
			"fieldname": "variance",
			"label": "Variance",
			"fieldtype": "Currency",
			"width": 130,
		},
		{
			"fieldname": "variance_pct",
			"label": "Variance %",
			"fieldtype": "Percent",
			"width": 100,
		},
		{
			"fieldname": "status",
			"label": "Status",
			"fieldtype": "Data",
			"width": 120,
		},
	]


def get_data(filters):
	conditions = ["pb.docstatus = 1"]
	params = {}

	if filters.get("company"):
		conditions.append("p.company = %(company)s")
		params["company"] = filters["company"]

	if filters.get("project"):
		conditions.append("pb.project = %(project)s")
		params["project"] = filters["project"]

	if filters.get("fiscal_year"):
		conditions.append("pb.fiscal_year = %(fiscal_year)s")
		params["fiscal_year"] = filters["fiscal_year"]

	budgets = frappe.db.sql(
		"""
		SELECT
			pb.name AS project_budget,
			pb.project,
			pb.total_budget_amount,
			p.customer,
			c.customer_name
		FROM `tabProject Budget` pb
		LEFT JOIN `tabProject` p ON p.name = pb.project
		LEFT JOIN `tabCustomer` c ON c.name = p.customer
		WHERE {conditions}
		ORDER BY pb.project, pb.name
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)

	if not budgets:
		return [], []

	projects = [b.project for b in budgets]
	po_totals = _get_project_po_totals(projects, filters)
	wo_totals = _get_project_wo_totals(projects, filters)

	data = []
	chart_data = []

	for budget in budgets:
		wbs_rows = frappe.db.get_all(
			"Project Budget WBS",
			filters={"parent": budget.project_budget},
			fields=["main_wbs", "sub_wbs", "description", "budget_amount"],
			order_by="main_wbs, sub_wbs",
		)

		po_actual = flt(po_totals.get(budget.project, 0))
		wo_actual = flt(wo_totals.get(budget.project, 0))
		total_actual = po_actual + wo_actual
		total_budget = flt(budget.total_budget_amount)
		variance = total_actual - total_budget
		variance_pct = round(variance / total_budget * 100, 1) if total_budget else 0

		# Project summary row (bold)
		data.append({
			"project": budget.project,
			"customer_name": budget.customer_name or "",
			"project_budget": budget.project_budget,
			"main_wbs": "",
			"sub_wbs": "",
			"description": "Total",
			"budget_amount": total_budget,
			"actual_po": po_actual,
			"actual_wo": wo_actual,
			"total_actual": total_actual,
			"variance": variance,
			"variance_pct": variance_pct,
			"status": _status_label(variance),
			"bold": 1,
			"indent": 0,
		})

		# WBS detail rows — show actual against matching WBS type
		for wbs in wbs_rows:
			wbs_po = po_actual if wbs.main_wbs == "Procurement" else None
			wbs_wo = wo_actual if wbs.main_wbs == "Production" else None
			wbs_actual = flt(wbs_po or 0) + flt(wbs_wo or 0)
			wbs_budget = flt(wbs.budget_amount)
			wbs_variance = (wbs_actual - wbs_budget) if (wbs_po is not None or wbs_wo is not None) else None
			wbs_variance_pct = (
				round(wbs_variance / wbs_budget * 100, 1)
				if wbs_variance is not None and wbs_budget
				else None
			)

			data.append({
				"project": "",
				"customer_name": "",
				"project_budget": "",
				"main_wbs": wbs.main_wbs,
				"sub_wbs": wbs.sub_wbs,
				"description": wbs.description or "",
				"budget_amount": wbs_budget,
				"actual_po": wbs_po,
				"actual_wo": wbs_wo,
				"total_actual": wbs_actual if (wbs_po is not None or wbs_wo is not None) else None,
				"variance": wbs_variance,
				"variance_pct": wbs_variance_pct,
				"status": _status_label(wbs_variance) if wbs_variance is not None else "",
				"indent": 1,
			})

		chart_data.append({
			"project": budget.project,
			"budget": total_budget,
			"actual": total_actual,
		})

	return data, chart_data


def _get_project_po_totals(projects, filters):
	if not projects:
		return {}

	conditions = ["po.docstatus = 1", "po.project IN %(projects)s"]
	params = {"projects": projects}

	if filters.get("from_date"):
		conditions.append("po.transaction_date >= %(from_date)s")
		params["from_date"] = filters["from_date"]

	if filters.get("to_date"):
		conditions.append("po.transaction_date <= %(to_date)s")
		params["to_date"] = filters["to_date"]

	rows = frappe.db.sql(
		"""
		SELECT po.project, IFNULL(SUM(po.grand_total), 0) AS total
		FROM `tabPurchase Order` po
		WHERE {conditions}
		GROUP BY po.project
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)

	return {r.project: flt(r.total) for r in rows}


def _get_project_wo_totals(projects, filters):
	if not projects:
		return {}

	conditions = ["wo.docstatus = 1", "wo.project IN %(projects)s"]
	params = {"projects": projects}

	if filters.get("from_date"):
		conditions.append("wo.planned_start_date >= %(from_date)s")
		params["from_date"] = filters["from_date"]

	if filters.get("to_date"):
		conditions.append("wo.planned_start_date <= %(to_date)s")
		params["to_date"] = filters["to_date"]

	rows = frappe.db.sql(
		"""
		SELECT wo.project, IFNULL(SUM(wo.planned_operating_cost), 0) AS total
		FROM `tabWork Order` wo
		WHERE {conditions}
		GROUP BY wo.project
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)

	return {r.project: flt(r.total) for r in rows}


def get_chart(chart_data):
	if not chart_data:
		return None

	return {
		"data": {
			"labels": [d["project"] for d in chart_data],
			"datasets": [
				{
					"name": "Budgeted Amount",
					"values": [d["budget"] for d in chart_data],
				},
				{
					"name": "Total Actual",
					"values": [d["actual"] for d in chart_data],
				},
			],
		},
		"type": "bar",
		"fieldtype": "Currency",
		"colors": ["#5e64ff", "#ff5858"],
		"barOptions": {"stacked": 0},
	}


def get_summary(chart_data):
	if not chart_data:
		return []

	total_budget = sum(d["budget"] for d in chart_data)
	total_actual = sum(d["actual"] for d in chart_data)
	variance = total_actual - total_budget
	over_budget = sum(1 for d in chart_data if d["actual"] > d["budget"])

	return [
		{
			"value": total_budget,
			"label": "Total Budgeted",
			"datatype": "Currency",
			"indicator": "blue",
		},
		{
			"value": total_actual,
			"label": "Total Actual",
			"datatype": "Currency",
			"indicator": "blue",
		},
		{
			"value": variance,
			"label": "Overall Variance",
			"datatype": "Currency",
			"indicator": "red" if variance > 0 else "green",
		},
		{
			"value": over_budget,
			"label": "Projects Over Budget",
			"datatype": "Int",
			"indicator": "red" if over_budget else "green",
		},
	]


def _status_label(variance):
	if variance is None:
		return ""
	if variance > 0:
		return "Over Budget"
	if variance < 0:
		return "Under Budget"
	return "On Budget"
