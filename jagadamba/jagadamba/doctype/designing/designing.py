# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Designing(Document):
	def validate(self):
		if not self.project:
			frappe.throw("Project is required before saving a Designing document.")
		# The Type decides which finished-item field applies; drop the one it hides.
		flags = frappe.get_cached_value("Type", self.type, ["show_job_item", "show_vehicle_item"]) if self.type else None
		self.show_job_item, self.show_vehicle_item = flags or (0, 0)
		if not self.show_job_item:
			self.oil_gas_item = None
		if not self.show_vehicle_item:
			self.vehicle_type = None
		if not self.item:
			self.item = self.oil_gas_item or self.vehicle_type

	def before_submit(self):
		self.status = "Sent to Customer"

	def on_cancel(self):
		self.status = "Cancelled"


@frappe.whitelist()
def get_project_details(project):
	"""Values a Designing document copies from its Project. Design Engineers can read Projects
	but not Customers, so the customer name is looked up here."""
	frappe.has_permission("Project", "read", project, throw=True)
	values = frappe.db.get_value(
		"Project", project, ["customer", "custom_types", "custom_vehicle_type", "oil_gas_item"], as_dict=True
	) or {}
	customer = values.get("customer") or ""
	return {
		"customer": customer,
		"customer_name": frappe.db.get_value("Customer", customer, "customer_name") if customer else "",
		"type": values.get("custom_types") or "",
		"vehicle_type": values.get("custom_vehicle_type") or "",
		"oil_gas_item": values.get("oil_gas_item") or "",
	}
