import frappe
from frappe.model.document import Document
from frappe.utils import flt


class ProjectBudget(Document):
	def validate(self):
		self._fetch_project_details()
		self._rollup_sub_wbs_costs()
		self._calculate_total()

	def before_submit(self):
		if not self.wbs_items:
			frappe.throw("Please add at least one WBS budget line before submitting.")
		if not flt(self.total_budget_amount):
			frappe.throw("Total Budget Amount must be greater than zero.")

	def _fetch_project_details(self):
		if self.project:
			proj = frappe.db.get_value(
				"Project", self.project,
				["sales_order", "customer", "custom_types"],
				as_dict=True,
			)
			if proj:
				if not self.sales_order:
					self.sales_order = proj.sales_order
				if not self.customer:
					self.customer = proj.customer
				if not self.custom_types:
					self.custom_types = proj.custom_types

		if self.customer:
			self.customer_name = frappe.db.get_value("Customer", self.customer, "customer_name") or ""

	def _rollup_sub_wbs_costs(self):
		for row in (self.wbs_items or []):
			sub_items = [s for s in (self.sub_wbs_items or []) if s.parent_wbs_row == row.name]
			if sub_items:
				row.budget_amount = sum(flt(s.cost) for s in sub_items)

	def _calculate_total(self):
		self.total_budget_amount = sum(flt(row.budget_amount) for row in (self.wbs_items or []))
