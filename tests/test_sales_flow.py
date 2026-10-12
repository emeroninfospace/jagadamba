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
	frappe.db.get_single_value = Mock(return_value="")
	frappe.get_doc = Mock()
	def throw(message):
		raise ValueError(message)
	frappe.throw = throw
	utils = types.ModuleType("frappe.utils")
	utils.flt = lambda value, precision=None: round(float(value or 0), precision) if precision is not None else float(value or 0)
	utils.cint = lambda value: int(value or 0)
	frappe.get_cached_doc = Mock()
	utils.today = lambda: "2026-10-12"
	utils.get_fullname = lambda user: "Tester"
	sys.modules.update({"frappe": frappe, "frappe.utils": utils})

from jagadamba.jagadamba.pricing import calculate_oil_gas_pricing
from jagadamba.jagadamba.overrides import quotation_overrides as quotation
from jagadamba.jagadamba.overrides import sales_order_overrides as sales_order
from jagadamba.jagadamba.overrides import opportunity_overrides as opportunity


class Doc(dict):
	def set(self, key, value):
		self[key] = value
	def is_new(self):
		return bool(self.get("__islocal"))
	def precision(self, field):
		return 2
	def __getattr__(self, key):
		return self.get(key)
	def __setattr__(self, key, value):
		self[key] = value


class PricingTests(unittest.TestCase):
	def setUp(self):
		self.config = patch("jagadamba.jagadamba.type_settings.get_configuration", side_effect=lambda name: {"enable_estimation": int(name == "Oil & Gas")})
		self.config.start()
		self.addCleanup(self.config.stop)
	def test_compound_formula_preserved_for_both_documents(self):
		for validate in (quotation.validate, sales_order.validate):
			doc = Doc(doctype="Quotation", custom_enable_estimation=1, custom_types="Oil & Gas", custom_sale_value_without_tax="1000",
				custom_vat_percent="5", custom_tax_percent="2", net_total="600")
			validate(doc)
			self.assertEqual(doc.custom_vat_amount, 50)
			self.assertEqual(doc.custom_tax_amount, 21)
			self.assertEqual(doc.custom_total_quoted_value, 1071)
			self.assertEqual(doc.custom_net_profit, 400)

	def test_zero_vat_is_a_valid_value(self):
		doc = Doc(doctype="Quotation", custom_enable_estimation=1, custom_types="Oil & Gas", custom_sale_value_without_tax=100,
			custom_vat_percent=0, custom_tax_percent=2, net_total=70)
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_vat_amount, 0)
		self.assertEqual(doc.custom_total_quoted_value, 102)

	def test_missing_values_do_not_raise(self):
		doc = Doc(doctype="Quotation", custom_enable_estimation=1, custom_types="Oil & Gas")
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_total_quoted_value, 0)

	def test_non_oil_gas_is_untouched(self):
		doc = Doc(custom_types="Trading", custom_total_quoted_value=123)
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc, {"custom_types": "Trading", "custom_total_quoted_value": 123})

	def test_negative_values_retain_existing_formula(self):
		doc = Doc(doctype="Quotation", custom_enable_estimation=1, custom_types="Oil & Gas", custom_sale_value_without_tax=-100,
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
		with patch.object(opportunity.frappe.db, "get_value", return_value=Doc(doctype="Quotation", custom_enable_estimation=1, custom_types="Oil & Gas", oil_gas_item="PIPE")):
			opportunity.before_insert(doc)
		self.assertIsNone(doc.custom_finished_item)

	def test_quotation_preserves_different_explicit_type(self):
		doc = Doc(opportunity="OPP-001", custom_types="Trailers")
		with patch.object(quotation.frappe.db, "get_value", return_value=Doc(doctype="Quotation", custom_enable_estimation=1, custom_types="Oil & Gas", custom_finished_item="PIPE")):
			quotation._copy_type_fields_from_opportunity(doc)
		self.assertIsNone(doc.oil_gas_item)

	def test_quotation_copies_matching_source_fields(self):
		doc = Doc(opportunity="OPP-001")
		with patch.object(quotation.frappe.db, "get_value", return_value=Doc(doctype="Quotation", custom_enable_estimation=1, custom_types="Oil & Gas", custom_finished_item="PIPE")):
			quotation._copy_type_fields_from_opportunity(doc)
		self.assertEqual(doc.custom_types, "Oil & Gas")
		self.assertEqual(doc.oil_gas_item, "PIPE")


class EstimationTests(unittest.TestCase):
	def estimate(self, **values):
		data = dict(doctype="Quotation", custom_enable_estimation=1, custom_types="Fabrication",
			custom_estimation_cost_source="Estimation", custom_sale_value_without_tax=85750,
			custom_vat_percent=5, custom_tax_percent=10,
			custom_estimation_items=[Doc(qty=q, rate=r) for q, r in
				[(10, 5000), (1, 1000), (1000, 20), (1, 10000), (10, 250), (7.5, 100)]])
		data.update(values)
		return Doc(data)

	def test_requirement_example_recalculated_from_inputs(self):
		doc = self.estimate(net_total=999999)
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_total_estimated_value, 84250)
		self.assertEqual(doc.custom_net_profit, 1500)
		self.assertEqual(doc.custom_vat_amount, 4287.50)
		self.assertEqual(doc.custom_tax_amount, 9003.75)
		self.assertEqual(doc.custom_total_quoted_value, 99041.25)

	def test_non_compound_tax_is_selectable(self):
		doc = self.estimate(custom_tax_basis="Sale Value")
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_tax_amount, 8575)
		self.assertEqual(doc.custom_total_quoted_value, 98612.5)

	def test_removing_last_row_resets_cost_without_net_total_fallback(self):
		doc = self.estimate(custom_estimation_items=[], net_total=99999)
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_total_estimated_value, 0)
		self.assertEqual(doc.custom_net_profit, 85750)

	def test_row_amounts_use_currency_precision(self):
		doc = self.estimate(custom_estimation_items=[Doc(qty=3, rate=0.3333), Doc(qty=1, rate=0)])
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_total_estimated_value, 1)
		self.assertEqual(doc.custom_estimation_items[1].amount, 0)

	def test_invalid_costs_and_rates_are_rejected(self):
		for row in [Doc(qty=-1, rate=1), Doc(qty=1, rate=-1), Doc(qty=float('inf'), rate=1), Doc(qty=1, rate='abc')]:
			with self.subTest(row=row), self.assertRaises(ValueError):
				calculate_oil_gas_pricing(self.estimate(custom_estimation_items=[row]))
		for rate in [-1, 101, float('nan')]:
			with self.subTest(rate=rate), self.assertRaises(ValueError):
				calculate_oil_gas_pricing(self.estimate(custom_vat_percent=rate))

	def test_legacy_basis_does_not_silently_ignore_cost_rows(self):
		with self.assertRaises(ValueError):
			calculate_oil_gas_pricing(self.estimate(custom_estimation_cost_source="Document Net Total"))

	def test_new_quote_uses_estimation_existing_quote_retains_legacy(self):
		for is_new, expected in [(1, 0), (0, 100)]:
			doc = self.estimate(custom_estimation_cost_source="", custom_estimation_items=[], __islocal=is_new, net_total=100)
			calculate_oil_gas_pricing(doc)
			self.assertEqual(doc.custom_total_estimated_value, expected)

	def test_type_configuration_overrides_tampered_client_flag(self):
		from jagadamba.jagadamba.type_settings import sync_type_settings
		doc = self.estimate(custom_enable_estimation=1)
		with patch.object(quotation.frappe, 'get_cached_doc', return_value=Doc(enable_estimation=0)):
			sync_type_settings(doc)
		self.assertEqual(doc.custom_enable_estimation, 0)
		calculate_oil_gas_pricing(doc)
		self.assertIsNone(doc.custom_total_quoted_value)

	def test_renamed_type_keeps_estimation_enabled(self):
		doc = self.estimate(custom_enable_estimation=0)
		with patch.object(quotation.frappe, 'get_cached_doc', return_value=Doc(enable_estimation=1)):
			quotation.validate(doc)
		self.assertEqual(doc.custom_total_estimated_value, 84250)

	def test_sales_order_reads_authorized_quotation_cost(self):
		doc = self.estimate(doctype="Sales Order", custom_quotation="Q1", custom_total_estimated_value=1)
		source = Doc(custom_types="Fabrication", docstatus=1, custom_total_estimated_value=84250, check_permission=Mock())
		with patch.object(quotation.frappe, 'get_doc', return_value=source):
			calculate_oil_gas_pricing(doc)
		source.check_permission.assert_called_once_with('read')
		self.assertEqual(doc.custom_total_estimated_value, 84250)
		self.assertEqual(doc.custom_net_profit, 1500)

	def test_sales_order_rejects_cost_from_different_currency_or_company(self):
		for company, currency in [('Other', 'AED'), ('Company A', 'USD')]:
			source = Doc(custom_types='Fabrication', docstatus=1, company=company, currency=currency, check_permission=Mock())
			with patch.object(quotation.frappe, 'get_doc', return_value=source), self.assertRaises(ValueError):
				calculate_oil_gas_pricing(self.estimate(doctype='Sales Order', custom_quotation='Q1', company='Company A', currency='AED'))

	def test_sales_order_requires_matching_readable_source(self):
		for source in [Doc(custom_types='Other', docstatus=1, check_permission=Mock()),
			Doc(custom_types='Fabrication', docstatus=2, check_permission=Mock()),
			Doc(check_permission=Mock(side_effect=PermissionError))]:
			with patch.object(quotation.frappe, 'get_doc', return_value=source), self.assertRaises((ValueError, PermissionError)):
				calculate_oil_gas_pricing(self.estimate(doctype='Sales Order', custom_quotation='Q1'))


class EstimationMetadataTests(unittest.TestCase):
	def test_field_layout_and_type_conditions(self):
		import json
		from pathlib import Path
		data = json.loads(Path('jagadamba/jagadamba/custom/quotation.json').read_text())
		fields = {f['fieldname']: f for f in data['custom_fields']}
		order = json.loads(next(p['value'] for p in data['property_setters'] if p['property'] == 'field_order'))
		self.assertEqual(len(order), len(set(order)))
		self.assertTrue(set(fields) <= set(order))
		self.assertEqual(fields['custom_additional_items']['depends_on'], 'eval:doc.custom_show_additional_items')
		self.assertEqual(fields['custom_estimation_section']['depends_on'], 'eval:doc.custom_enable_estimation')
		start, end = order.index('custom_estimation_section'), order.index('custom_oil_gas_pricing_section')
		self.assertIn('custom_estimation_items', order[start:end])
		self.assertFalse(any(fields.get(n, {}).get('fieldtype') == 'Column Break' for n in order[start:end]))

	def test_setup_marker_preserves_admin_changes_on_repeat_migrate(self):
		from jagadamba.patches import setup_estimation
		with patch.object(setup_estimation.frappe.db, 'exists', return_value=True), patch.object(setup_estimation.frappe.db, 'set_value') as write:
			setup_estimation.execute()
		write.assert_not_called()

	def test_setup_changes_only_type_configuration_and_document_flags(self):
		from jagadamba.patches import setup_estimation
		api = setup_estimation.frappe
		with patch.object(api.db, 'exists', side_effect=lambda dt, name: dt != 'Patch Log'), \
			patch.object(api.db, 'set_value') as write, \
			patch.object(api, 'clear_document_cache', create=True), \
			patch.object(api, 'get_all', return_value=['Oil & Gas'], create=True), \
			patch.object(setup_estimation, 'get_configuration', return_value={'enable_estimation': 1}), \
			patch.object(api, 'get_doc', return_value=Mock()) as log:
			setup_estimation._setup_type_configuration()
		self.assertEqual(write.call_count, 7)
		for call in write.call_args_list:
			self.assertFalse(call.kwargs['update_modified'])
			self.assertTrue(all('total' not in key and 'items' not in key.replace('show_additional_items','') for key in call.args[2]))
		log.assert_called_once_with({'doctype': 'Patch Log', 'patch': setup_estimation.MARKER})

	def test_layout_groups_estimation_in_its_tab_and_additional_items_under_items(self):
		import json
		from pathlib import Path
		data = json.loads(Path('jagadamba/jagadamba/custom/quotation.json').read_text())
		fields = {f['fieldname']: f for f in data['custom_fields']}
		order = json.loads(next(p['value'] for p in data['property_setters'] if p['property'] == 'field_order'))
		self.assertEqual(order[order.index('items') + 1:order.index('items') + 3],
			['custom_section_break_xuxav', 'custom_additional_items'])
		tab = order.index('custom_estimation_tab')
		self.assertEqual(fields['custom_estimation_tab']['fieldtype'], 'Tab Break')
		estimation = order[tab:order.index('address_and_contact_tab')]
		for name in ('custom_estimation_items', 'custom_total_estimated_value', 'custom_net_profit',
			'custom_total_quoted_value', 'custom_estimation_statement'):
			self.assertIn(name, estimation)
		for name in estimation:
			if name in fields and fields[name]['fieldtype'] not in ('Column Break',):
				self.assertTrue(fields[name].get('depends_on', '').startswith('eval:doc.custom_enable_estimation'))
		for name in order:
			if name in fields and fields[name].get('insert_after'):
				self.assertIn(fields[name]['insert_after'], order)

	def test_cost_codes_are_master_data(self):
		import json
		from pathlib import Path
		child = json.loads(Path('jagadamba/jagadamba/doctype/quotation_estimation_item/quotation_estimation_item.json').read_text())
		code = next(f for f in child['fields'] if f['fieldname'] == 'code')
		self.assertEqual((code['fieldtype'], code['options']), ('Link', 'Estimation Cost Code'))
		fetched = {f['fieldname']: f.get('fetch_from') for f in child['fields']}
		self.assertEqual(fetched['description'], 'code.description')
		self.assertEqual(fetched['uom'], 'code.default_uom')

	def test_existing_typed_codes_become_cost_code_masters_once(self):
		from jagadamba.patches import setup_estimation
		api = setup_estimation.frappe
		rows = [Doc(code='M', description='Material', uom='Ton'), Doc(code='M', description='Other', uom='Kg'), Doc(code='', description='x')]
		created = []
		existing = set()
		def exists(dt, name=None):
			return dt == 'Item Group' or (dt == 'Estimation Cost Code' and name in existing)
		def get_doc(values):
			created.append(values)
			if values['doctype'] == 'Estimation Cost Code':
				existing.add(values['code'])
			return Mock()
		with patch.object(api.db, 'exists', side_effect=exists), \
			patch.object(api, 'get_all', return_value=rows, create=True), \
			patch.object(api.db, 'get_single_value', return_value=''), \
			patch.object(api.db, 'set_single_value') as default_group, \
			patch.object(api, 'get_doc', side_effect=get_doc):
			setup_estimation._setup_cost_codes_and_defaults()
		self.assertEqual(created[0], {'doctype': 'Estimation Cost Code', 'code': 'M', 'description': 'Material', 'default_uom': 'Ton'})
		self.assertEqual(created[1], {'doctype': 'Patch Log', 'patch': setup_estimation.COST_CODE_MARKER})
		self.assertEqual(len(created), 2)
		default_group.assert_called_once_with('Jagadamba Settings', 'default_finished_item_group', 'Finished Items')


class TypeConfigurationTests(unittest.TestCase):
	def test_finished_item_group_falls_back_to_settings_default(self):
		from jagadamba.jagadamba import type_settings
		api = type_settings.frappe
		with patch.object(api.db, 'get_single_value', return_value='Assemblies'), \
			patch.object(api, 'get_cached_doc', return_value=Doc(show_additional_items=1)):
			self.assertEqual(type_settings.get_configuration('Any Type')['finished_item_group'], 'Assemblies')
			self.assertEqual(type_settings.get_configuration('Any Type')['show_additional_items'], 1)
			self.assertEqual(type_settings.get_configuration(None)['finished_item_group'], 'Assemblies')
			self.assertEqual(type_settings.get_configuration(None)['show_additional_items'], 0)
		with patch.object(api.db, 'get_single_value', return_value='Assemblies'), \
			patch.object(api, 'get_cached_doc', return_value=Doc(finished_item_group='Skids')):
			self.assertEqual(type_settings.get_finished_item_group('Any Type'), 'Skids')


if __name__ == "__main__":
	unittest.main()
