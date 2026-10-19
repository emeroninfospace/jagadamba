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
	def test_sales_order_formula_uses_net_total(self):
		doc = Doc(doctype="Sales Order", custom_enable_estimation=1, custom_types="Oil & Gas", custom_sale_value_without_tax="1000",
			custom_vat_percent="5", custom_tax_percent="2", net_total="600")
		sales_order.validate(doc)
		self.assertEqual(doc.custom_total_estimated_value, 600)
		self.assertEqual(doc.custom_vat_amount, 50)
		self.assertEqual(doc.custom_tax_amount, 21)
		self.assertEqual(doc.custom_total_quoted_value, 1071)
		self.assertEqual(doc.custom_net_profit, 400)

	def costing(self, **values):
		rows = [(10, 5000), (1, 1000), (1000, 20), (1, 10000), (10, 250), (7.5, 100)]
		data = dict(doctype="Quotation", custom_types="Oil & Gas", net_total=85750, custom_vat_percent=5, custom_tax_percent=10,
			custom_costing=[Doc(qty=qty, rate=rate) for qty, rate in rows])
		data.update(values)
		return Doc(data)

	def test_quotation_costing_sheet_example(self):
		doc = self.costing()
		quotation.validate(doc)
		self.assertEqual([row.amount for row in doc.custom_costing], [50000, 1000, 20000, 10000, 2500, 750])
		self.assertEqual(doc.custom_total_estimated_value, 84250)
		self.assertEqual(doc.custom_sale_value_without_tax, 85750)
		self.assertEqual(doc.custom_net_profit, 1500)
		self.assertEqual(doc.custom_vat_amount, 4287.5)
		self.assertEqual(doc.custom_tax_amount, 9003.75)
		self.assertEqual(doc.custom_total_quoted_value, 99041.25)

	def test_quotation_sale_value_is_items_net_total_not_typed_value(self):
		doc = self.costing(custom_sale_value_without_tax=1, net_total=90000)
		quotation.validate(doc)
		self.assertEqual(doc.custom_sale_value_without_tax, 90000)
		self.assertEqual(doc.custom_net_profit, 5750)

	def test_quotation_without_costing_type_is_untouched(self):
		doc = self.costing(custom_types="Trading")
		quotation.validate(doc)
		self.assertEqual(doc.custom_enable_estimation, 0)
		self.assertIsNone(doc.custom_total_estimated_value)
		self.assertIsNone(doc.custom_costing[0].amount)

	def test_quotation_costing_rejects_bad_numbers(self):
		doc = self.costing(custom_costing=[Doc(qty="abc", rate=1)])
		with self.assertRaises(ValueError):
			quotation.validate(doc)

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


class SalesOrderPricingTests(unittest.TestCase):
	def order(self, **values):
		data = dict(doctype="Sales Order", custom_enable_estimation=1, custom_types="Fabrication", net_total=84250,
			custom_sale_value_without_tax=85750, custom_vat_percent=5, custom_tax_percent=10)
		data.update(values)
		return Doc(data)

	def test_requirement_example(self):
		doc = self.order()
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_total_estimated_value, 84250)
		self.assertEqual(doc.custom_net_profit, 1500)
		self.assertEqual(doc.custom_vat_amount, 4287.50)
		self.assertEqual(doc.custom_tax_amount, 9003.75)
		self.assertEqual(doc.custom_total_quoted_value, 99041.25)

	def test_non_compound_tax_is_selectable(self):
		doc = self.order(custom_tax_basis="Sale Value")
		calculate_oil_gas_pricing(doc)
		self.assertEqual(doc.custom_tax_amount, 8575)

	def test_invalid_rates_are_rejected(self):
		for rate in [-1, 101, float('nan'), 'abc']:
			with self.subTest(rate=rate), self.assertRaises(ValueError):
				calculate_oil_gas_pricing(self.order(custom_vat_percent=rate))

	def test_type_configuration_overrides_tampered_client_flag(self):
		doc = self.order()
		with patch.object(quotation.frappe, 'get_cached_doc', return_value=Doc(enable_estimation=0)):
			sales_order.validate(doc)
		self.assertEqual(doc.custom_enable_estimation, 0)
		self.assertIsNone(doc.custom_total_quoted_value)


class LayoutTests(unittest.TestCase):
	def load(self, name):
		import json
		from pathlib import Path
		data = json.loads(Path(f'jagadamba/jagadamba/custom/{name}.json').read_text())
		order = json.loads(next(p['value'] for p in data['property_setters'] if p['property'] == 'field_order'))
		return {f['fieldname']: f for f in data['custom_fields']}, order

	def test_quotation_layout_and_additional_items_follow_items(self):
		from jagadamba.patches.setup_estimation import REMOVED_QUOTATION_FIELDS
		fields, order = self.load('quotation')
		self.assertEqual(len(order), len(set(order)))
		self.assertFalse(set(REMOVED_QUOTATION_FIELDS) & (set(fields) | set(order)))
		self.assertEqual(set(fields) - set(order), set())
		self.assertEqual(order[order.index('items') + 1:order.index('items') + 3], ['custom_section_break_xuxav', 'custom_additional_items'])
		self.assertEqual(fields['custom_additional_items']['depends_on'], 'eval:doc.custom_show_additional_items')
		for field in fields.values():
			if field.get('insert_after'):
				self.assertIn(field['insert_after'], order)

	def test_quotation_costing_is_type_driven_and_kept_off_prints(self):
		fields, order = self.load('quotation')
		costing = order[order.index('custom_section_break_xjxuo'):order.index('items_section')]
		self.assertEqual(costing[:2], ['custom_section_break_xjxuo', 'custom_costing'])
		self.assertEqual(costing[-1], 'custom_total_quoted_value')
		for name in costing:
			if fields[name]['fieldtype'] != 'Column Break':
				self.assertEqual(fields[name]['depends_on'], 'eval:doc.custom_enable_estimation', name)
		for name in ('custom_costing', 'custom_total_estimated_value', 'custom_net_profit'):
			self.assertEqual(fields[name]['print_hide'], 1, name)
		self.assertEqual(fields['custom_costing']['options'], 'Quotation Cost Estimate')
		self.assertEqual(fields['custom_enable_estimation']['hidden'], 1)

	def test_quotation_pricing_fields_match_sales_order_for_mapping(self):
		quotation_fields, _ = self.load('quotation')
		order_fields, _ = self.load('sales_order')
		for name in ('custom_sale_value_without_tax', 'custom_vat_percent', 'custom_tax_percent', 'custom_tax_basis',
			'custom_total_estimated_value', 'custom_net_profit', 'custom_total_quoted_value'):
			self.assertEqual(quotation_fields[name]['fieldtype'], order_fields[name]['fieldtype'], name)

	def test_sales_order_pricing_is_type_driven(self):
		fields, order = self.load('sales_order')
		self.assertEqual(fields['custom_oil_gas_pricing_section']['depends_on'], 'eval:doc.custom_enable_estimation')
		self.assertNotIn('custom_estimation_cost_source', fields)
		for field in fields.values():
			if field.get('insert_after'):
				self.assertIn(field['insert_after'], order)

	def test_lead_technical_sections_follow_job_item(self):
		fields, order = self.load('lead')
		for name in ('equipment_section', 'technical_specs_section', 'requirements_section'):
			self.assertEqual(fields[name]['depends_on'], 'eval:doc.custom_show_job_item')
		self.assertEqual(order[order.index('custom_types') - 1], 'col_break123')
		self.assertEqual(order[order.index('oil_gas_item') - 1], 'custom_vehicle_type')


class SetupTests(unittest.TestCase):
	def test_setup_marker_preserves_admin_changes_on_repeat_migrate(self):
		from jagadamba.patches import setup_estimation
		api = setup_estimation.frappe
		with patch.object(api.db, 'exists', return_value=True), patch.object(api.db, 'set_value') as write, \
			patch.object(api, 'delete_doc', create=True) as delete:
			setup_estimation.execute()
		write.assert_not_called()
		delete.assert_not_called()

	def test_type_flags_only_written_to_fields_the_doctype_has(self):
		from jagadamba.patches import setup_estimation
		api = setup_estimation.frappe
		meta = Mock(has_field=lambda key: key != 'custom_enable_estimation')
		with patch.object(api.db, 'exists', side_effect=lambda dt, name: dt != 'Patch Log'), \
			patch.object(api.db, 'set_value') as write, \
			patch.object(api, 'clear_document_cache', create=True), \
			patch.object(api, 'get_meta', return_value=meta, create=True), \
			patch.object(api, 'get_all', return_value=['Oil & Gas'], create=True), \
			patch.object(setup_estimation, 'get_configuration', return_value={'enable_estimation': 1, 'show_job_item': 1}), \
			patch.object(api, 'get_doc', return_value=Mock()) as log:
			setup_estimation._setup_type_configuration()
		document_writes = [c for c in write.call_args_list if c.args[0] != 'Type']
		self.assertEqual(len(document_writes), 4)
		for call in write.call_args_list:
			self.assertFalse(call.kwargs['update_modified'])
		for call in document_writes:
			self.assertEqual(call.args[2], {'custom_show_job_item': 1})
		log.assert_called_once_with({'doctype': 'Patch Log', 'patch': setup_estimation.MARKER})

	def test_removes_quotation_estimation_fields_once(self):
		from jagadamba.patches import setup_estimation
		api = setup_estimation.frappe
		existing = {'Custom Field': {'Quotation-custom_vat_percent', 'Quotation-custom_estimation_items'}, 'DocType': {'Estimation Cost Code'}}
		# custom_vat_percent belongs to the Costing sheet now and must survive the cleanup.
		with patch.object(api.db, 'exists', side_effect=lambda dt, name: isinstance(name, str) and name in existing.get(dt, set())), \
			patch.object(api, 'delete_doc', create=True) as delete, \
			patch.object(api, 'clear_cache', create=True), \
			patch.object(api, 'get_doc', return_value=Mock()) as log:
			setup_estimation._remove_quotation_estimation()
		deleted = {c.args[:2] for c in delete.call_args_list}
		self.assertEqual(deleted, {('Custom Field', 'Quotation-custom_estimation_items'), ('DocType', 'Estimation Cost Code')})
		log.assert_called_once_with({'doctype': 'Patch Log', 'patch': setup_estimation.REMOVE_QUOTATION_ESTIMATION_MARKER})


	def test_removes_unused_layout_fields_once(self):
		from jagadamba.patches import setup_estimation
		api = setup_estimation.frappe
		existing = {'Custom Field': {'Sales Order-custom_column_break_7ozif', 'Quotation-custom_estimation_tab'}}
		with patch.object(api.db, 'exists', side_effect=lambda dt, name: isinstance(name, str) and name in existing.get(dt, set())), \
			patch.object(api, 'delete_doc', create=True) as delete, \
			patch.object(api, 'clear_cache', create=True), \
			patch.object(api, 'get_doc', return_value=Mock()) as log:
			setup_estimation._remove_layout_fields()
		deleted = {c.args[:2] for c in delete.call_args_list}
		self.assertEqual(deleted, {('Custom Field', 'Sales Order-custom_column_break_7ozif'), ('Custom Field', 'Quotation-custom_estimation_tab')})
		log.assert_called_once_with({'doctype': 'Patch Log', 'patch': setup_estimation.FORM_CLEANUP_MARKER})

	def test_quotation_costing_enabled_once_for_oil_and_gas(self):
		from jagadamba.patches import setup_estimation
		api = setup_estimation.frappe
		with patch.object(api.db, 'exists', side_effect=lambda dt, name: dt == 'Type'), \
			patch.object(api.db, 'set_value') as write, \
			patch.object(api, 'clear_document_cache', create=True), \
			patch.object(api, 'get_doc', return_value=Mock()) as log:
			setup_estimation._enable_quotation_costing()
		write.assert_called_once_with('Type', 'Oil & Gas', 'enable_estimation', 1, update_modified=False)
		log.assert_called_once_with({'doctype': 'Patch Log', 'patch': setup_estimation.QUOTATION_COSTING_MARKER})

	def test_removed_layout_fields_are_gone_from_fixtures(self):
		import json

		from jagadamba.patches import setup_estimation
		files = {'Quotation': 'quotation', 'Sales Order': 'sales_order', 'Lead': 'lead'}
		for doctype, fieldname in setup_estimation.REMOVED_LAYOUT_FIELDS:
			with open(f'jagadamba/jagadamba/custom/{files[doctype]}.json') as handle:
				self.assertNotIn(f'"{fieldname}"', handle.read(), fieldname)


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

	def _query(self, filters, type_exists=True, group='Finished Goods'):
		from jagadamba.jagadamba import type_settings
		api = type_settings.frappe
		api._dict = getattr(api, '_dict', None) or Doc
		with patch.object(api.db, 'exists', return_value=type_exists, create=True), \
			patch.object(type_settings, 'get_configuration', return_value={'finished_item_group': group}), \
			patch.object(api, 'get_list', return_value=[['JGES-1', 'Tanker']], create=True) as get_list:
			result = type_settings.finished_item_query('Item', 'tank', 'name', 0, 10, filters)
		return result, get_list.call_args

	def test_finished_item_query_limits_to_type_group_and_company(self):
		result, call = self._query({'type': 'Oil & Gas', 'company': 'Jagadamba'})
		self.assertEqual(result, [['JGES-1', 'Tanker']])
		self.assertEqual(call.kwargs['filters'], {'disabled': 0, 'custom_types': 'Oil & Gas', 'custom_company': 'Jagadamba',
			'item_group': ['descendants of (inclusive)', 'Finished Goods']})
		self.assertEqual(call.kwargs['or_filters'], {'name': ['like', '%tank%'], 'item_name': ['like', '%tank%']})
		self.assertEqual(call.kwargs['limit_page_length'], 10)

	def test_finished_item_query_without_type_uses_default_group_only(self):
		_, call = self._query({'type': '', 'parent_item': 1}, group='Assemblies')
		self.assertEqual(call.kwargs['filters'], {'disabled': 0, 'custom_parent_item': 1,
			'item_group': ['descendants of (inclusive)', 'Assemblies']})

	def test_finished_item_query_ignores_unknown_type(self):
		_, call = self._query({'type': 'Missing'}, type_exists=False, group='')
		self.assertEqual(call.kwargs['filters'], {'disabled': 0})


if __name__ == "__main__":
	unittest.main()
