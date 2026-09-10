import json
import frappe
from frappe import _
from frappe.utils import flt, today


@frappe.whitelist()
def create_material_request_from_bom(bom):
	bom_doc = frappe.get_doc("BOM", bom)

	if not bom_doc.items:
		frappe.throw(_("BOM {0} has no items to request.").format(bom))

	mr = frappe.new_doc("Material Request")
	mr.material_request_type = "Purchase"
	mr.transaction_date = today()
	mr.schedule_date = today()
	mr.company = bom_doc.company

	if bom_doc.project:
		mr.project = bom_doc.project

	for item in bom_doc.items:
		uom = item.uom or item.stock_uom
		mr.append("items", {
			"item_code": item.item_code,
			"item_name": item.item_name,
			"description": item.description or item.item_name,
			"qty": item.qty,
			"uom": uom,
			"stock_uom": item.stock_uom or uom,
			"schedule_date": today(),
		})

	return mr


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
	po.custom_types = so.custom_types
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

	if sales_order:
		sales_order_doc = frappe.get_doc("Sales Order", sales_order)

		for so_item in sales_order_doc.items:
			project.append("custom_project_items", {
				"item_code": so_item.item_code,
				"item_name": so_item.item_name,
				"amount": so_item.amount,
				"estimated_amount": 0,
			})

	project.insert(ignore_permissions=True)

	if sales_order:
		frappe.db.set_value(
			"Sales Order",
			sales_order,
			"project",
			project.name
		)

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
			SELECT item_code, item_name, stock_uom, item_group, description
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
					"item_group": ci.item_group,
					"description": ci.description,
				}
			)

	return result



#Production Dashboard API

import frappe
from frappe.utils import getdate, nowdate, add_days, flt

JOB_CARD_STATUS_ORDER = [
	"Open",
	"Work In Progress",
	"Material Transferred",
	"On Hold",
	"Completed",
]


@frappe.whitelist()
def get_production_dashboard_data(period="this_month", date_from=None, date_to=None, project=None):
	project = project or None  # normalize empty string from the "All Projects" option
	date_range = _resolve_period(period, date_from, date_to)

	job_card_summary, job_card_board = get_job_card_data(project)

	data = {
		"period_label": date_range["label"],
		"project": project,
		"pipeline_summary": get_pipeline_summary(project),
		"vehicle_type_summary": get_vehicle_type_summary(),
		"job_card_summary": job_card_summary,
		"job_card_board": job_card_board,
		"work_orders": get_work_order_data(project),
		"ocs_board": get_ocs_board(),
		"designing_board": get_designing_board(),
		"overdue_job_cards": get_overdue_job_cards(project),
		"project_pipeline": get_project_pipeline(),
		"operation_load": get_operation_load(project),
	}
	return data


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


def get_pipeline_summary(project=None):
	def count(doctype, filters=None):
		try:
			return frappe.db.count(doctype, filters or {})
		except Exception:
			return 0

	so_filters = {"docstatus": 1}
	ocs_filters = {"docstatus": ["!=", 2], "status": ["not in", ["Cancelled"]]}
	designing_filters = {"docstatus": ["!=", 2], "status": ["in", ["Draft", "Design In Progress", "Sent to Customer"]]}
	wo_open_filters = {"docstatus": 1, "status": ["in", ["Not Started", "In Process"]]}
	wo_completed_filters = {"docstatus": 1, "status": ["in", ["Completed", "Closed"]]}
	jc_filters = {"docstatus": ["!=", 2], "status": ["not in", ["Completed", "Cancelled"]]}

	if project:
		so_filters["project"] = project
		ocs_filters["project"] = project
		designing_filters["project"] = project
		wo_open_filters["project"] = project
		wo_completed_filters["project"] = project
		# Job Card has no project field of its own — filter via its Work Order.
		jc_work_orders = frappe.db.get_all("Work Order", filters={"project": project}, pluck="name")
		jc_filters["work_order"] = ["in", jc_work_orders or [""]]

	return {
		"leads": count("Lead"),
		"quotations": count("Quotation", {"docstatus": ["!=", 2]}),
		"sales_orders": count("Sales Order", so_filters),
		"ocs_open": count("Order Confirmation Sheet", ocs_filters),
		"designing_in_progress": count("Designing", designing_filters),
		"boms": count("BOM", {"docstatus": 1, "is_active": 1}),
		"work_orders_open": count("Work Order", wo_open_filters),
		"work_orders_completed": count("Work Order", wo_completed_filters),
		"job_cards_open": count("Job Card", jc_filters),
	}


def get_vehicle_type_summary():
	# Sales Order has no custom_vehicle_type field of its own — vehicle type lives on
	# Quotation, and Sales Order links back to it via custom_quotation.
	return frappe.db.sql(
		"""
		SELECT
			IFNULL(vt.vehicle_type_name, 'Unassigned') AS vehicle_type,
			COUNT(so.name) AS count
		FROM `tabSales Order` so
		LEFT JOIN `tabQuotation` q ON q.name = so.custom_quotation
		LEFT JOIN `tabVehicle Type` vt ON vt.name = q.custom_vehicle_type
		WHERE so.docstatus = 1
		GROUP BY q.custom_vehicle_type
		ORDER BY count DESC
		""",
		as_dict=True,
	)


def get_job_card_data(project=None):
	if not frappe.db.table_exists("Job Card"):
		return {}, {}

	conditions = ["jc.docstatus != 2"]
	params = {}
	if project:
		conditions.append("wo.project = %(project)s")
		params["project"] = project

	rows = frappe.db.sql(
		"""
		SELECT
			jc.name, jc.work_order, jc.operation, jc.workstation, jc.status,
			jc.for_quantity, jc.total_completed_qty,
			jc.expected_start_date, jc.expected_end_date,
			wo.production_item, wo.item_name AS wo_item_name,
			wo.project, p.project_name
		FROM `tabJob Card` jc
		LEFT JOIN `tabWork Order` wo ON wo.name = jc.work_order
		LEFT JOIN `tabProject` p ON p.name = wo.project
		WHERE {conditions}
		ORDER BY jc.expected_end_date ASC
		LIMIT 300
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)

	summary = {s: 0 for s in JOB_CARD_STATUS_ORDER}
	board = {s: [] for s in JOB_CARD_STATUS_ORDER}

	for jc in rows:
		status = jc.status or "Open"
		if status not in summary:
			summary[status] = 0
			board[status] = []
		summary[status] += 1
		board[status].append(jc)

	return summary, board


def get_work_order_data(project=None):
	if not frappe.db.table_exists("Work Order"):
		return []

	conditions = ["wo.docstatus = 1"]
	params = {}
	if project:
		conditions.append("wo.project = %(project)s")
		params["project"] = project

	rows = frappe.db.sql(
		"""
		SELECT
			wo.name, wo.production_item, wo.item_name, wo.qty, wo.produced_qty,
			wo.status, wo.project, p.project_name, wo.planned_start_date,
			wo.sales_order, wo.bom_no
		FROM `tabWork Order` wo
		LEFT JOIN `tabProject` p ON p.name = wo.project
		WHERE {conditions}
		ORDER BY wo.planned_start_date DESC
		LIMIT 100
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)

	for wo in rows:
		wo["percent_complete"] = round((flt(wo.produced_qty) / flt(wo.qty) * 100), 1) if wo.qty else 0

	return rows


def get_ocs_board():
	if not frappe.db.table_exists("Order Confirmation Sheet"):
		return {}

	rows = frappe.db.get_all(
		"Order Confirmation Sheet",
		filters={"docstatus": ["!=", 2]},
		fields=["name", "customer_name", "status", "vehicle_type", "date", "project", "sales_order"],
		order_by="date desc",
		limit_page_length=100,
	)
	board = {}
	for r in rows:
		board.setdefault(r.status or "Draft", []).append(r)
	return board


def get_designing_board():
	if not frappe.db.table_exists("Designing"):
		return {}

	rows = frappe.db.get_all(
		"Designing",
		filters={"docstatus": ["!=", 2]},
		fields=["name", "customer_name", "status", "vehicle_type", "date", "project", "item"],
		order_by="date desc",
		limit_page_length=100,
	)
	board = {}
	for r in rows:
		board.setdefault(r.status or "Draft", []).append(r)
	return board


def get_overdue_job_cards(project=None):
	if not frappe.db.table_exists("Job Card"):
		return []

	conditions = [
		"jc.docstatus != 2",
		"jc.status NOT IN ('Completed', 'Cancelled')",
		"jc.expected_end_date IS NOT NULL",
		"jc.expected_end_date < %(today)s",
	]
	params = {"today": nowdate()}
	if project:
		conditions.append("wo.project = %(project)s")
		params["project"] = project

	return frappe.db.sql(
		"""
		SELECT
			jc.name, jc.operation, jc.workstation, jc.status, jc.expected_end_date,
			wo.production_item, wo.item_name AS wo_item_name, wo.project
		FROM `tabJob Card` jc
		LEFT JOIN `tabWork Order` wo ON wo.name = jc.work_order
		WHERE {conditions}
		ORDER BY jc.expected_end_date ASC
		LIMIT 50
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)


def get_project_pipeline():
	# Always returns the FULL list (unfiltered), regardless of the dashboard's
	# selected project — this is what populates the project filter dropdown,
	# and the client highlights the selected row rather than hiding the rest.
	projects = frappe.db.get_all(
		"Project",
		filters={"status": ["!=", "Cancelled"]},
		fields=["name", "project_name", "customer", "status"],
		order_by="creation desc",
		limit_page_length=100,
	)

	result = []
	for p in projects:
		so = frappe.db.get_value(
			"Sales Order",
			{"project": p.name, "docstatus": 1},
			["name", "custom_quotation"],
		)
		vehicle_type = None
		if so and so[1]:
			vehicle_type = frappe.db.get_value("Quotation", so[1], "custom_vehicle_type")

		ocs = None
		if frappe.db.table_exists("Order Confirmation Sheet"):
			ocs = frappe.db.get_value(
				"Order Confirmation Sheet", {"project": p.name, "docstatus": ["!=", 2]}, "name"
			)
		designing = None
		if frappe.db.table_exists("Designing"):
			designing = frappe.db.get_value(
				"Designing", {"project": p.name, "docstatus": ["!=", 2]}, ["name", "status"]
			)
		wo = None
		if frappe.db.table_exists("Work Order"):
			wo = frappe.db.get_value(
				"Work Order", {"project": p.name, "docstatus": 1}, ["name", "status", "produced_qty", "qty"]
			)

		stage = "Lead / Quotation"
		if so:
			stage = "Sales Order"
		if ocs:
			stage = "Order Confirmation"
		if designing:
			stage = "Design"
		if wo:
			stage = "Production"
		if wo and wo[1] in ("Completed", "Closed"):
			stage = "Completed"

		result.append(
			{
				"project": p.name,
				"project_name": p.project_name,
				"customer": p.customer,
				"sales_order": so[0] if so else None,
				"vehicle_type": vehicle_type,
				"ocs": ocs,
				"designing": designing[0] if designing else None,
				"designing_status": designing[1] if designing else None,
				"work_order": wo[0] if wo else None,
				"wo_status": wo[1] if wo else None,
				"wo_percent": round((flt(wo[2]) / flt(wo[3]) * 100), 1) if wo and wo[3] else 0,
				"stage": stage,
			}
		)
	return result


def get_operation_load(project=None):
	if not frappe.db.table_exists("Job Card"):
		return []

	conditions = ["jc.docstatus != 2", "jc.status NOT IN ('Completed', 'Cancelled')"]
	params = {}
	if project:
		conditions.append("wo.project = %(project)s")
		params["project"] = project

	return frappe.db.sql(
		"""
		SELECT
			jc.operation, jc.workstation,
			COUNT(*) AS job_count,
			SUM(jc.for_quantity) AS total_qty
		FROM `tabJob Card` jc
		LEFT JOIN `tabWork Order` wo ON wo.name = jc.work_order
		WHERE {conditions}
		GROUP BY jc.operation, jc.workstation
		ORDER BY job_count DESC
		LIMIT 20
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)