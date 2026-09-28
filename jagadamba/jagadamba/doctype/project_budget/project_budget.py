import frappe
from frappe.model.document import Document
from frappe.utils import flt


class ProjectBudget(Document):
	def validate(self):
		self._fetch_project_details()
		self._rollup_wbs_costs()
		self._sync_sub_wbs_main_label()
		self._calculate_total()
		self._calculate_actual_totals()

	def before_submit(self):
		if not self.wbs_items:
			frappe.throw("Please add at least one WBS budget line before submitting.")
		if not flt(self.total_budget_amount):
			frappe.throw("Total Budget Amount must be greater than zero.")

	def _fetch_project_details(self):
		if self.project:
			proj = frappe.db.get_value(
				"Project", self.project,
				["sales_order", "customer", "custom_types", "custom_vehicle_type", "oil_gas_item"],
				as_dict=True,
			)
			if proj:
				if not self.sales_order:
					self.sales_order = proj.sales_order
				if not self.customer:
					self.customer = proj.customer
				if not self.custom_types:
					self.custom_types = proj.custom_types
				if not self.custom_vehicle_type:
					self.custom_vehicle_type = proj.custom_vehicle_type
				if not self.oil_gas_item:
					self.oil_gas_item = proj.oil_gas_item

		if self.customer:
			self.customer_name = frappe.db.get_value("Customer", self.customer, "customer_name") or ""


	def _rollup_wbs_costs(self):
		for row in (self.wbs_items or []):
			sub_items = [s for s in (self.sub_wbs_items or []) if s.parent_wbs_row == row.name]
			sub_total = sum(flt(s.cost) for s in sub_items)
			if sub_total:
				row.budget_amount =  sub_total

	def _sync_sub_wbs_main_label(self):
		"""Keep main_wbs label on sub-WBS rows in sync with parent WBS description."""
		wbs_map = {row.name: (row.description or row.wbs_element or "") for row in (self.wbs_items or [])}
		for sub in (self.sub_wbs_items or []):
			if sub.parent_wbs_row and sub.parent_wbs_row in wbs_map:
				sub.main_wbs = wbs_map[sub.parent_wbs_row]

	def _calculate_total(self):
		self.total_budget_amount = sum(flt(row.budget_amount) for row in (self.wbs_items or []))

	def _calculate_actual_totals(self):
		po_total, so_total = _get_project_actual_totals(self.project)
		self.total_purchase_order_amount = po_total
		self.total_sales_order_amount = so_total


def _get_project_actual_totals(project):
	if not project:
		return 0.0, 0.0

	po_total = flt(
		frappe.db.sql(
			"""
			SELECT IFNULL(SUM(grand_total), 0)
			FROM `tabPurchase Order`
			WHERE project = %s AND docstatus = 1
			""",
			project,
		)[0][0]
	)

	so_total = flt(
		frappe.db.sql(
			"""
			SELECT IFNULL(SUM(grand_total), 0)
			FROM `tabSales Order`
			WHERE project = %s AND docstatus = 1
			""",
			project,
		)[0][0]
	)

	return po_total, so_total


@frappe.whitelist()
def get_actual_totals(project):
	po_total, so_total = _get_project_actual_totals(project)
	return {
		"total_purchase_order_amount": po_total,
		"total_sales_order_amount": so_total,
	}
