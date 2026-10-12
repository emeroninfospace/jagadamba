"""Isolated regression tests; run python -m unittest discover -s tests -v."""
import importlib.util
import sys
import types
import unittest
from unittest.mock import Mock, patch

if importlib.util.find_spec("frappe") is None:
	frappe = types.ModuleType("frappe")
	frappe.whitelist = lambda: lambda f: f
	frappe._ = lambda message: message
	frappe.session = types.SimpleNamespace(user="tester@example.com")
	frappe.db = Mock()
	frappe.get_doc = Mock()
	def throw(message):
		raise ValueError(message)
	frappe.throw = throw
	utils = types.ModuleType("frappe.utils")
	utils.flt = lambda value: float(value or 0)
	utils.today = lambda: "2026-10-12"
	utils.get_fullname = lambda user: "Tester"
	sys.modules.update({"frappe": frappe, "frappe.utils": utils})

from jagadamba.jagadamba.pricing import calculate_oil_gas_pricing
from jagadamba.jagadamba.overrides import quotation_overrides as quotation
from jagadamba.jagadamba.overrides import sales_order_overrides as sales_order
from jagadamba.jagadamba.overrides import opportunity_overrides as opportunity


class Doc(dict):
	def __getattr__(self, key):
		return self.get(key)
	def __setattr__(self, key, value):
		self[key] = value


class PricingTests(unittest.TestCase):
	def test_compound_formula_preserved_for_both_documents(self):
		for validate in (quotation.validate, sales_order.validate):
			doc = Doc(custom_types="Oil & Gas", custom_sale_value_without_tax="1000",
				custom_vat_percent="5", custom_tax_percent="2", net_total="600")
			validate(doc)
			self.assertEqual(doc.custom_vat_amount, 50)
			self.assertEqual(doc.custom_tax_amount, 21)
			self.assertEqual(doc.custom_total_quoted_value, 1071)
			self.assertEqual(doc.custom_net_profit, 400)

	def test_zero_vat_is_a_valid_value(self):
		doc = Doc(custom_types="Oil & Gas", custom_sale_value_without_tax=100,
			custom_vat_percent=0, custom_tax_percent=2, net_total=70)
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_vat_amount, 0)
		self.assertEqual(doc.custom_total_quoted_value, 102)

	def test_missing_values_do_not_raise(self):
		doc = Doc(custom_types="Oil & Gas")
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_total_quoted_value, 0)

	def test_non_oil_gas_is_untouched(self):
		doc = Doc(custom_types="Trading", custom_total_quoted_value=123)
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc, {"custom_types": "Trading", "custom_total_quoted_value": 123})

	def test_negative_values_retain_existing_formula(self):
		doc = Doc(custom_types="Oil & Gas", custom_sale_value_without_tax=-100,
			custom_vat_percent=5, custom_tax_percent=2, net_total=0)
		calculate_oil_gas_pricing(doc)
		self.assertAlmostEqual(doc.custom_total_quoted_value, -107.1)


class RevisionTests(unittest.TestCase):
	def test_note_requires_write_permission_before_db_write(self):
		doc = Doc(check_permission=Mock(side_effect=PermissionError), db_set=Mock())
		with patch.object(quotation.frappe, "get_doc", return_value=doc):
			with self.assertRaises(PermissionError):
				quotation.log_revision_note("Q-001", "Note")
		doc.db_set.assert_not_called()

	def test_note_uses_locked_document_and_existing_history(self):
		doc = Doc(revision_number="Rev 02", revision_history="Previous entry", status="Open",
			check_permission=Mock(), db_set=Mock())
		with patch.object(quotation.frappe, "get_doc", return_value=doc) as getter, \
			patch.object(quotation.frappe.db, "get_value") as query, \
			patch.object(quotation, "get_fullname", return_value="Tester"), \
			patch.object(quotation, "today", return_value="2026-10-12"):
			self.assertTrue(quotation.log_revision_note("Q-001", "  Updated scope  "))
		getter.assert_called_once_with("Quotation", "Q-001", for_update=True)
		doc.check_permission.assert_called_once_with("write")
		query.assert_not_called()
		doc.db_set.assert_called_once_with("revision_history",
			"Previous entry\nRev 02 | 2026-10-12 | Tester | Open | Updated scope", update_modified=False)

	def test_blank_note_rejected_without_document_lookup(self):
		with patch.object(quotation.frappe, "get_doc") as getter, \
			patch.object(quotation.frappe, "throw", side_effect=ValueError):
			for note in (None, "", "  ", 12):
				with self.assertRaises(ValueError):
					quotation.log_revision_note("Q-001", note)
		getter.assert_not_called()


class MappingTests(unittest.TestCase):
	def test_opportunity_preserves_different_explicit_type(self):
		doc = Doc(opportunity_from="Lead", party_name="L-001", custom_types="Trading")
		with patch.object(opportunity.frappe.db, "get_value", return_value=Doc(custom_types="Oil & Gas", oil_gas_item="PIPE")):
			opportunity.before_insert(doc)
		self.assertIsNone(doc.custom_finished_item)

	def test_quotation_preserves_different_explicit_type(self):
		doc = Doc(opportunity="OPP-001", custom_types="Trailers")
		with patch.object(quotation.frappe.db, "get_value", return_value=Doc(custom_types="Oil & Gas", custom_finished_item="PIPE")):
			quotation._copy_type_fields_from_opportunity(doc)
		self.assertIsNone(doc.oil_gas_item)

	def test_quotation_copies_matching_source_fields(self):
		doc = Doc(opportunity="OPP-001")
		with patch.object(quotation.frappe.db, "get_value", return_value=Doc(custom_types="Oil & Gas", custom_finished_item="PIPE")):
			quotation._copy_type_fields_from_opportunity(doc)
		self.assertEqual(doc.custom_types, "Oil & Gas")
		self.assertEqual(doc.oil_gas_item, "PIPE")


if __name__ == "__main__":
	unittest.main()
