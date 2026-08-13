# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class OrderConfirmationSheet(Document):
	def validate(self):
		if not self.project:
			frappe.throw(
				"Project must be linked before saving an Order Confirmation Sheet. "
				"Please create a Project from the Sales Order first."
			)

	def before_submit(self):
		self.status = "Sent to Design"

	def on_cancel(self):
		self.status = "Cancelled"
