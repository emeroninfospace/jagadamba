# Copyright (c) 2026, Emeron Infospace and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Designing(Document):
	def validate(self):
		if not self.project:
			frappe.throw("Project is required before saving a Designing document.")

	def before_submit(self):
		self.status = "Sent to Customer"

	def on_cancel(self):
		self.status = "Cancelled"
