import frappe
from frappe.model.document import Document
from frappe.utils import flt


class ProjectBudget(Document):
	def validate(self):
		self._fetch_project_details()
		self._sync_po_amounts()
		self._rollup_wbs_costs()
		self._sync_sub_wbs_main_label()
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

	def _sync_po_amounts(self):
		"""Refresh po_amount from PO for every WBS row that has a PO linked."""
		for row in (self.wbs_items or []):
			if row.purchase_order:
				po_total = frappe.db.get_value("Purchase Order", row.purchase_order, "grand_total") or 0
				row.po_amount = flt(po_total)
			else:
				row.po_amount = 0

	def _rollup_wbs_costs(self):
		"""budget_amount = po_amount + sum of linked sub-WBS costs."""
		for row in (self.wbs_items or []):
			sub_items = [s for s in (self.sub_wbs_items or []) if s.parent_wbs_row == row.name]
			sub_total = sum(flt(s.cost) for s in sub_items)
			if sub_total or row.po_amount:
				row.budget_amount = flt(row.po_amount) + sub_total

	def _sync_sub_wbs_main_label(self):
		"""Keep main_wbs label on sub-WBS rows in sync with parent WBS description."""
		wbs_map = {row.name: (row.description or row.wbs_element or "") for row in (self.wbs_items or [])}
		for sub in (self.sub_wbs_items or []):
			if sub.parent_wbs_row and sub.parent_wbs_row in wbs_map:
				sub.main_wbs = wbs_map[sub.parent_wbs_row]

	def _calculate_total(self):
		self.total_budget_amount = sum(flt(row.budget_amount) for row in (self.wbs_items or []))
