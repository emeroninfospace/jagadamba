import frappe
from frappe.utils import flt

# Project Budget docstatus filter: < 2 = Draft + Submitted, = 1 = Submitted only
PB_DOCSTATUS_COND = "pb.docstatus < 2"


@frappe.whitelist()
def get_project_dashboard_data(company=None, status=None):
	company = company or _default_company()

	projects = get_projects(company, status)
	item_variance = get_item_variance(company)

	data = {
		"company": company,
		"kpis": get_kpis(projects),
		"projects": projects,
		"status_breakdown": get_status_breakdown(projects),
		"item_variance": item_variance,
		"over_budget_projects": get_over_budget_projects(projects),
		"wbs_lines": get_wbs_lines(company, status),
	}
	return data


def _default_company():
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		company = frappe.db.get_value("Company", {}, "name", order_by="creation asc")
	return company


def get_projects(company, status=None):
	conditions = ["p.status != 'Cancelled'"]
	params = {"company": company}
	if company:
		conditions.append("p.company = %(company)s")
	if status:
		conditions.append("p.status = %(status)s")
		params["status"] = status

	rows = frappe.db.sql(
		"""
		SELECT
			p.name, p.project_name, p.customer, p.status, p.percent_complete,
			p.expected_start_date, p.expected_end_date, p.sales_order,
			p.estimated_costing, p.total_purchase_cost, p.total_costing_amount,
			p.total_billed_amount,
			IFNULL(SUM(pi.amount), 0) AS actual_items_total,
			IFNULL(SUM(pi.estimated_amount), 0) AS estimated_items_total
		FROM `tabProject` p
		LEFT JOIN `tabProject Items` pi ON pi.parent = p.name
		WHERE {conditions}
		GROUP BY p.name
		ORDER BY p.creation DESC
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)

	wbs_map = get_wbs_totals([p.name for p in rows])

	for p in rows:
		p["variance_amount"] = flt(p.actual_items_total) - flt(p.estimated_items_total)
		p["variance_pct"] = (
			round((p["variance_amount"] / p.estimated_items_total * 100), 1)
			if p.estimated_items_total
			else 0
		)
		p["vehicle_type"] = _get_vehicle_type(p.sales_order)

		wbs = wbs_map.get(p.name) or {}
		p["wbs_budget_total"] = flt(wbs.get("wbs_budget_total"))
		p["wbs_line_count"] = wbs.get("wbs_line_count") or 0
		p["wbs_utilisation_pct"] = (
			round(flt(p.actual_items_total) / p["wbs_budget_total"] * 100, 1)
			if p["wbs_budget_total"]
			else 0
		)

	return rows


def get_wbs_totals(project_names):
	if not project_names:
		return {}

	rows = frappe.db.sql(
		"""
		SELECT
			pb.project,
			IFNULL(SUM(w.budget_amount), 0) AS wbs_budget_total,
			COUNT(w.name) AS wbs_line_count
		FROM `tabProject Budget WBS` w
		JOIN `tabProject Budget` pb ON pb.name = w.parent
		WHERE w.parenttype = 'Project Budget'
			AND w.parentfield = 'wbs_items'
			AND {pb_cond}
			AND pb.project IN %(projects)s
		GROUP BY pb.project
		""".format(pb_cond=PB_DOCSTATUS_COND),
		{"projects": tuple(project_names)},
		as_dict=True,
	)
	return {r.project: r for r in rows}


def get_wbs_lines(company, status=None, limit=15):
	conditions = [PB_DOCSTATUS_COND, "p.status != 'Cancelled'"]
	params = {"limit": limit}
	if company:
		conditions.append("p.company = %(company)s")
		params["company"] = company
	if status:
		conditions.append("p.status = %(status)s")
		params["status"] = status

	rows = frappe.db.sql(
		"""
		SELECT
			w.name AS wbs_row,
			w.parent AS project_budget,
			pb.project,
			p.project_name,
			w.wbs_element,
			w.description,
			IFNULL(w.budget_amount, 0) AS budget_amount,
			IFNULL(s.sub_total, 0) AS sub_wbs_total,
			IFNULL(s.sub_count, 0) AS sub_wbs_count
		FROM `tabProject Budget WBS` w
		JOIN `tabProject Budget` pb
			ON pb.name = w.parent
			AND w.parenttype = 'Project Budget'
			AND w.parentfield = 'wbs_items'
		JOIN `tabProject` p ON p.name = pb.project
		LEFT JOIN (
			SELECT parent_wbs_row, SUM(cost) AS sub_total, COUNT(name) AS sub_count
			FROM `tabProject Budget Sub WBS`
			WHERE parenttype = 'Project Budget'
			GROUP BY parent_wbs_row
		) s ON s.parent_wbs_row = w.name
		WHERE {conditions}
		ORDER BY w.budget_amount DESC
		LIMIT %(limit)s
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)

	for r in rows:
		r["unallocated"] = flt(r.budget_amount) - flt(r.sub_wbs_total)

	return rows


def _get_vehicle_type(sales_order):
	if not sales_order:
		return None
	quotation = frappe.db.get_value("Sales Order", sales_order, "custom_quotation")
	if not quotation:
		return None
	return frappe.db.get_value("Quotation", quotation, "custom_vehicle_type")


def get_kpis(projects):
	total = len(projects)
	active = len([p for p in projects if p.status in ("Open", "Working")])
	completed = len([p for p in projects if p.status == "Completed"])

	total_estimated = sum(flt(p.estimated_items_total) for p in projects)
	total_actual = sum(flt(p.actual_items_total) for p in projects)
	overall_variance = total_actual - total_estimated
	overall_variance_pct = round((overall_variance / total_estimated * 100), 1) if total_estimated else 0

	over_budget_count = len([p for p in projects if flt(p.variance_amount) > 0])

	total_wbs_budget = sum(flt(p.get("wbs_budget_total")) for p in projects)
	wbs_utilisation_pct = round(total_actual / total_wbs_budget * 100, 1) if total_wbs_budget else 0

	return {
		"total_projects": total,
		"active_projects": active,
		"completed_projects": completed,
		"total_estimated": total_estimated,
		"total_actual": total_actual,
		"overall_variance": overall_variance,
		"overall_variance_pct": overall_variance_pct,
		"over_budget_count": over_budget_count,
		"total_wbs_budget": total_wbs_budget,
		"wbs_utilisation_pct": wbs_utilisation_pct,
	}


def get_status_breakdown(projects):
	counts = {}
	for p in projects:
		counts[p.status] = counts.get(p.status, 0) + 1
	return [{"status": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])]


def get_item_variance(company, limit=12):
	rows = frappe.db.sql(
		"""
		SELECT
			pi.item_code, pi.item_name,
			SUM(pi.estimated_amount) AS estimated_total,
			SUM(pi.amount) AS actual_total
		FROM `tabProject Items` pi
		JOIN `tabProject` p ON p.name = pi.parent
		WHERE p.status != 'Cancelled' {company_filter}
		GROUP BY pi.item_code
		HAVING estimated_total > 0 OR actual_total > 0
		""".format(company_filter="AND p.company = %(company)s" if company else ""),
		{"company": company},
		as_dict=True,
	)

	for r in rows:
		r["variance_amount"] = flt(r.actual_total) - flt(r.estimated_total)
		r["variance_pct"] = (
			round((r["variance_amount"] / r.estimated_total * 100), 1) if r.estimated_total else 0
		)

	rows.sort(key=lambda x: abs(x["variance_amount"]), reverse=True)
	return rows[:limit]


def get_over_budget_projects(projects, limit=8):
	over = [p for p in projects if flt(p.variance_amount) > 0]
	over.sort(key=lambda x: flt(x["variance_amount"]), reverse=True)
	return over[:limit]


@frappe.whitelist()
def get_project_detail(project):
	proj = frappe.db.get_value(
		"Project",
		project,
		["name", "project_name", "customer", "status", "percent_complete", "sales_order",
			"expected_start_date", "expected_end_date", "estimated_costing"],
		as_dict=True,
	)
	if not proj:
		frappe.throw("Project not found")

	items = frappe.db.get_all(
		"Project Items",
		filters={"parent": project},
		fields=["item_code", "item_name", "estimated_amount", "amount"],
	)
	for i in items:
		i["variance_amount"] = flt(i.amount) - flt(i.estimated_amount)
		i["variance_pct"] = round((i["variance_amount"] / i.estimated_amount * 100), 1) if i.estimated_amount else 0

	proj["items"] = items
	proj["vehicle_type"] = _get_vehicle_type(proj.sales_order)

	proj["wbs_lines"] = frappe.db.sql(
		"""
		SELECT w.name AS wbs_row, w.parent AS project_budget, w.wbs_element,
			w.description, IFNULL(w.budget_amount, 0) AS budget_amount
		FROM `tabProject Budget WBS` w
		JOIN `tabProject Budget` pb ON pb.name = w.parent
		WHERE w.parenttype = 'Project Budget' AND {pb_cond} AND pb.project = %s
		ORDER BY w.parent, w.idx
		""".format(pb_cond=PB_DOCSTATUS_COND),
		(project,),
		as_dict=True,
	)
	return proj


@frappe.whitelist()
def get_item_projects(item_code):
	rows = frappe.db.sql(
		"""
		SELECT p.name AS project, p.project_name, p.status,
			pi.estimated_amount, pi.amount
		FROM `tabProject Items` pi
		JOIN `tabProject` p ON p.name = pi.parent
		WHERE pi.item_code = %s AND p.status != 'Cancelled'
		ORDER BY p.creation DESC
		""",
		(item_code,),
		as_dict=True,
	)
	for r in rows:
		r["variance_amount"] = flt(r.amount) - flt(r.estimated_amount)
		r["variance_pct"] = round((r["variance_amount"] / r.estimated_amount * 100), 1) if r.estimated_amount else 0
	return rows