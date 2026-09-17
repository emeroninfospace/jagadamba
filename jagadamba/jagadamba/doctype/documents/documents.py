import frappe
from frappe.model.document import Document


class Documents(Document):
	def onload(self):
		if "System Manager" not in frappe.get_roles():
			self.set("drawing_attachments", [
				row for row in (self.drawing_attachments or [])
				if not row.user or row.user == frappe.session.user
			])

	def validate(self):
		self._fetch_project_details()
		self._set_attachment_users()
		if not self.is_new():
			self._preserve_other_users_attachments()

	def before_submit(self):
		if not self.raw_materials:
			frappe.throw("Please add at least one raw material before submitting.")

	def on_cancel(self):
		if self.bom:
			frappe.throw("Cannot cancel a Documents record that has a linked BOM. Cancel the BOM first.")

	def _fetch_project_details(self):
		if not self.project:
			return
		proj = frappe.db.get_value(
			"Project", self.project,
			["sales_order", "customer", "custom_types"],
			as_dict=True,
		)
		if not proj:
			return
		if not self.sales_order:
			self.sales_order = proj.sales_order
		if not self.customer:
			self.customer = proj.customer
		if not self.type:
			self.type = proj.custom_types
		if self.customer and not self.customer_name:
			self.customer_name = frappe.db.get_value("Customer", self.customer, "customer_name") or ""

		if not self.project_budget:
			self.project_budget = frappe.db.get_value(
				"Project Budget",
				{"project": self.project, "docstatus": 1},
				"name",
			)

		if not self.vehicle_type and self.sales_order:
			quotation = frappe.db.get_value("Sales Order", self.sales_order, "custom_quotation")
			if quotation:
				self.vehicle_type = frappe.db.get_value("Quotation", quotation, "custom_vehicle_type") or ""

	def _set_attachment_users(self):
		for row in (self.drawing_attachments or []):
			if not row.user:
				row.user = frappe.session.user

	def _preserve_other_users_attachments(self):
		if "System Manager" in frappe.get_roles():
			return
		existing = frappe.get_doc(self.doctype, self.name)
		other_rows = [r for r in existing.drawing_attachments if r.user != frappe.session.user]
		self.drawing_attachments = other_rows + list(self.drawing_attachments or [])
