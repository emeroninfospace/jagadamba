import frappe
from frappe.model.document import Document


class Drawing(Document):
	def validate(self):
		self._fetch_project_details()

	def before_submit(self):
		if not self.raw_materials:
			frappe.throw("Please add at least one raw material before submitting.")

	def on_cancel(self):
		if self.bom:
			frappe.throw("Cannot cancel a Drawing that has a linked BOM. Cancel the BOM first.")

	def _fetch_project_details(self):
		if not self.project:
			return
		proj = frappe.db.get_value(
			"Project", self.project,
			["sales_order", "customer"],
			as_dict=True,
		)
		if not proj:
			return
		if not self.sales_order:
			self.sales_order = proj.sales_order
		if not self.customer:
			self.customer = proj.customer
		if self.customer and not self.customer_name:
			self.customer_name = frappe.db.get_value("Customer", self.customer, "customer_name") or ""

		if not self.project_budget:
			self.project_budget = frappe.db.get_value(
				"Project Budget",
				{"project": self.project, "docstatus": 1},
				"name",
			)
