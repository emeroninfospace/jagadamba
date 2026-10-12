"""Fast boundary tests. Run: python -m unittest discover -s tests -v.

A minimal Frappe stub lets these tests run outside bench. Actual database row
permission behaviour must also be checked in a staging Frappe site.
"""
import importlib.util
import sys
import types
import unittest
from datetime import date, timedelta
from unittest.mock import Mock, patch

if importlib.util.find_spec("frappe") is None:
    frappe = types.ModuleType("frappe")
    frappe._ = lambda value: value
    frappe.whitelist = lambda: lambda function: function
    frappe.PermissionError = PermissionError
    frappe.session = types.SimpleNamespace(user="user@example.com")
    frappe.db = Mock()
    frappe.defaults = Mock()
    for name in ("get_roles", "get_list", "get_all", "get_cached_doc", "has_permission", "get_meta", "throw"):
        setattr(frappe, name, Mock())
    model = types.ModuleType("frappe.model")
    model.get_permitted_fields = Mock()
    utils = types.ModuleType("frappe.utils")
    utils.getdate = lambda value: value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
    utils.nowdate = lambda: "2026-10-12"
    utils.today = utils.nowdate
    utils.flt = lambda value: float(value or 0)
    utils.add_days = lambda value, days: utils.getdate(value) + timedelta(days=days)
    def add_months(value, months):
        index = value.year * 12 + value.month - 1 + months
        return value.replace(year=index // 12, month=index % 12 + 1)
    utils.add_months = add_months
    sys.modules.update({"frappe": frappe, "frappe.model": model, "frappe.utils": utils})

from jagadamba.jagadamba import workspace_dashboard as dashboard
from jagadamba.workspace_config import WORKSPACES, roles_for


class Row(dict):
    """Minimal stand-in for a Frappe child row: attribute and .get access."""
    __getattr__ = dict.get


def source(**values):
    base = {"name": "row-1", "enabled": 1, "source_doctype": "Quotation", "label": "Quotation",
            "date_field": "transaction_date", "status_field": "status", "amount_field": "base_grand_total"}
    return Row({**base, **values})


def profile(scope, roles, sources=()):
    return Row(name=scope, enabled=1, title="T", roles=[Row(role=role) for role in roles], sources=list(sources))


def fail(message, exception=ValueError):
    raise exception(message)


class DashboardBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.stack = []
        self.stub("throw", side_effect=fail)
        self.stub("session", new=types.SimpleNamespace(user="staff@example.com"))
        self.stub("get_roles", return_value=["Sales Executive"])
        self.stub("defaults", new=types.SimpleNamespace(get_user_default=lambda field: "Other Co"))

    def stub(self, name, **kwargs):
        patcher = patch.object(dashboard.frappe, name, **kwargs)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def use_profiles(self):
        profiles = {scope: profile(scope, roles_for(scope)) for scope in ("sales", "hr", "overview")}
        self.stub("db", new=types.SimpleNamespace(exists=lambda doctype, name=None: name in profiles))
        self.stub("get_cached_doc", side_effect=lambda doctype, name: profiles[name])
        return profiles

    def test_sales_role_cannot_read_hr(self):
        self.use_profiles()
        with self.assertRaises(PermissionError):
            dashboard.check_scope("hr")
        dashboard.check_scope("sales")
        dashboard.check_scope("overview")

    def test_profile_roles_are_dynamic(self):
        profiles = self.use_profiles()
        profiles["hr"]["roles"].append(Row(role="Sales Executive"))
        dashboard.check_scope("hr")

    def test_disabled_profile_rejected(self):
        profiles = self.use_profiles()
        profiles["sales"]["enabled"] = 0
        with self.assertRaises(ValueError):
            dashboard.check_scope("sales")

    def test_unknown_scope_rejected(self):
        self.use_profiles()
        with self.assertRaises(ValueError):
            dashboard.check_scope("tabSalary Slip")

    def test_filter_tokens_and_unreadable_filter_fields(self):
        parsed = dashboard.configured_filters('{"due_date": ["between", ["@today", "@today+30"]], "docstatus": 1}',
                                              {"due_date"})
        self.assertEqual(parsed, {"due_date": ["between", ["2026-10-12", "2026-11-11"]], "docstatus": 1})
        self.assertIsNone(dashboard.configured_filters('{"salary": [">", 0]}', {"due_date"}))
        self.assertIsNone(dashboard.configured_filters('{"due_date": ["; drop", 1]}', {"due_date"}))

    def test_quarter_and_previous_period(self):
        self.assertEqual(dashboard.resolve_period("this_quarter"), (date(2026, 10, 1), date(2026, 10, 12)))
        self.assertEqual(dashboard.previous_period(date(2026, 10, 1), date(2026, 10, 12)), (date(2026, 9, 19), date(2026, 9, 30)))

    def test_system_manager_cannot_call_legacy_sql(self):
        self.stub("get_roles", return_value=["System Manager"])
        with self.assertRaises(PermissionError):
            dashboard.require_legacy_administrator()

    def test_administrator_can_use_legacy_api(self):
        self.stub("session", new=types.SimpleNamespace(user="Administrator"))
        dashboard.require_legacy_administrator()

    def test_reversed_and_excessive_dates_rejected(self):
        for start, end in [("2026-10-12", "2026-09-01"), ("2024-01-01", "2026-10-12")]:
            with self.assertRaises(ValueError):
                dashboard.resolve_period("custom", start, end)

    def test_missing_custom_date_rejected(self):
        with self.assertRaises(ValueError):
            dashboard.resolve_period("custom", "2026-10-01")

    def test_last_month_boundary(self):
        with patch.object(dashboard, "nowdate", return_value="2026-01-12"):
            self.assertEqual(dashboard.resolve_period("last_month"), (date(2025, 12, 1), date(2025, 12, 31)))

    def test_company_cannot_be_forged(self):
        rows = [types.SimpleNamespace(name="Allowed Co")]
        with self.assertRaises(PermissionError):
            dashboard.selected_company("Other Co", rows)
        self.assertEqual(dashboard.selected_company(None, rows), "Allowed Co")

    def test_no_company_does_not_fall_back_to_global(self):
        with self.assertRaises(PermissionError):
            dashboard.selected_company(None, [])

    def test_global_source_is_omitted(self):
        self.stub("get_meta", return_value=types.SimpleNamespace(has_field=lambda field: False))
        self.assertIsNone(dashboard.source_filters("Item", "Allowed Co", None))

    def test_missing_business_unit_field_is_not_silently_ignored(self):
        self.stub("get_meta", return_value=types.SimpleNamespace(has_field=lambda field: field == "company"))
        self.assertIsNone(dashboard.source_filters("Employee", "Allowed Co", "Trading"))

    def test_unreadable_source_makes_no_data_queries(self):
        query = self.stub("get_list")
        with patch.object(dashboard, "readable", return_value=False):
            self.assertIsNone(dashboard.summary(source(), "Allowed", None, date(2026, 10, 1), date(2026, 10, 12)))
        query.assert_not_called()

    def test_queries_keep_company_and_row_permissions_and_end_date(self):
        meta = types.SimpleNamespace(has_field=lambda field: field in {"company", "custom_types"},
            get_field=lambda field: types.SimpleNamespace(fieldtype="Date"), get_label=lambda field: field.title())
        self.stub("get_meta", return_value=meta)
        responses = [[{"total": 2, "amount": 100}], [{"total": 1, "amount": 50}], [], [], [],
            [Row(date="2026-10-12", value=2, amount=100)], [], [{"total": 1}]]
        query = self.stub("get_list", side_effect=responses)
        fields = ["name", "company", "custom_types", "transaction_date", "status", "base_grand_total", "party_name", "valid_till"]
        row = source(party_field="party_name", alert_filters='{"valid_till": ["<", "@today"]}', alert_label="Expired")
        with patch.object(dashboard, "readable", return_value=True), patch.object(dashboard, "get_permitted_fields", return_value=fields):
            result = dashboard.summary(row, "Allowed Co", "Trading", date(2026, 10, 1), date(2026, 10, 12))
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["previous_total"], 1)
        self.assertEqual(result["trend"], [{"label": "2026-10", "value": 2, "amount": 100}])
        self.assertEqual(result["alert"]["count"], 1)
        self.assertIn(["Quotation", "valid_till", "<", "2026-10-12"], result["alert"]["filters"])
        self.assertEqual(query.call_count, 8)
        for call in query.call_args_list:
            args = call.kwargs
            self.assertNotIn("ignore_permissions", args)
            self.assertIn(["Quotation", "company", "=", "Allowed Co"], args["filters"])
            self.assertIn(["Quotation", "custom_types", "=", "Trading"], args["filters"])
        period_calls = [call.kwargs for call in query.call_args_list[:1] + query.call_args_list[2:7]]
        for args in period_calls:
            self.assertIn(["Quotation", "transaction_date", "<", "2026-10-13"], args["filters"])
        self.assertIn(["Quotation", "transaction_date", "<", "2026-10-01"], query.call_args_list[1].kwargs["filters"])

    def test_restricted_amount_is_not_queried(self):
        self.stub("get_meta", return_value=types.SimpleNamespace(has_field=lambda f: f == "company",
            get_field=lambda f: types.SimpleNamespace(fieldtype="Date"), get_label=lambda f: f))
        query = self.stub("get_list", side_effect=[[{"total": 0}], [{"total": 0}], [], []])
        with patch.object(dashboard, "readable", return_value=True), patch.object(dashboard, "get_permitted_fields", return_value=["name", "transaction_date"]):
            result = dashboard.summary(source(), "Allowed", None, date(2026, 10, 1), date(2026, 10, 12))
        self.assertIsNone(result["amount"])
        self.assertFalse(any("sum(" in field for call in query.call_args_list for field in call.kwargs["fields"]))


class WorkspaceExportTests(unittest.TestCase):
    def test_all_workspace_blocks_and_roles_resolve(self):
        import json
        from pathlib import Path
        blocks = {row["name"] for row in json.loads(Path("jagadamba/fixtures/custom_html_block.json").read_text())}
        for path in Path("jagadamba/jagadamba/workspace").glob("*/*.json"):
            workspace = json.loads(path.read_text())
            self.assertEqual({row["role"] for row in workspace["roles"]}, set(roles_for(WORKSPACES[workspace["name"]])))
            for row in workspace["custom_blocks"]:
                self.assertIn(row["custom_block_name"], blocks)
            self.assertTrue(all(row["type"] not in ("number_card", "chart") for row in json.loads(workspace["content"])))


class ProfileSeedTests(unittest.TestCase):
    def seeds(self):
        import json
        from pathlib import Path
        return json.loads(Path("jagadamba/workspace_profiles.json").read_text())

    def test_every_block_has_a_seeded_profile_and_home_workspace(self):
        import json
        import re
        from pathlib import Path
        scopes = {seed["scope"]: seed for seed in self.seeds()}
        for block in json.loads(Path("jagadamba/fixtures/custom_html_block.json").read_text()):
            scope = re.search(r'mount\(root_element, "(\w+)"\)', block["script"]).group(1)
            self.assertIn(scope, scopes)
            self.assertEqual({row["role"] for row in block["roles"]}, set(roles_for(scope)))
        for seed in scopes.values():
            self.assertIn(seed["home_workspace"], WORKSPACES)
            self.assertTrue(set(seed["landing_roles"]) <= set(roles_for(seed["scope"])) | {"System Manager", "Management"})
            for row in seed["sources"]:
                for key in ("extra_filters", "alert_filters"):
                    if row.get(key):
                        self.assertIsInstance(json.loads(row[key]), dict)

    def test_user_list_departments_land_on_their_desk(self):
        seeds = self.seeds()
        landing = {seed["scope"]: seed["landing_roles"] for seed in seeds}
        rows = [Row(name=seed["scope"], home_workspace=seed["home_workspace"], landing_priority=seed["landing_priority"])
                for seed in sorted(seeds, key=lambda seed: (seed["landing_priority"], seed["scope"]))]

        def get_all(doctype, filters=None, fields=None, order_by=None, pluck=None):
            return landing[filters["parent"]] if doctype == "Has Role" else rows

        expected = {
            ("Sales Executive", "Design Engineer", "Project Engineer"): "Sales Desk",
            ("Production Engineer", "Design Engineer"): "Production",
            ("Production Engineer", "Project Engineer"): "Production",
            ("Design Engineer",): "Design",
            ("Quality Engineer",): "Quality Desk",
            ("Stores User",): "Stores",
            ("Stores User", "Procurement Engineer"): "Procurement Desk",
            ("Finance Manager",): "Accounting Overview",
            ("HR Manager", "HR User"): "HR Overview",
            ("Delivery Manager", "Delivery User"): "Logistics Desk",
            ("Maintenance Manager", "Maintenance User"): "Maintenance Desk",
            ("Management",): "Jagadamba",
        }
        with patch.object(dashboard.frappe, "db", new=types.SimpleNamespace(exists=lambda *args: True)), \
             patch.object(dashboard.frappe, "get_all", side_effect=get_all):
            for roles, workspace in expected.items():
                self.assertEqual(dashboard.home_profile(roles).home_workspace, workspace, roles)
            self.assertIsNone(dashboard.home_profile(["Employee"]))

    def test_seed_cleaning_drops_unsupported_fields(self):
        from jagadamba import install
        meta = types.SimpleNamespace(has_field=lambda field: field in {"posting_date", "status", "company"})
        with patch.object(install.frappe, "db", new=types.SimpleNamespace(exists=lambda *args: True)), \
             patch.object(install.frappe, "get_meta", return_value=meta):
            row = install.clean_source({"source_doctype": "X", "date_field": "posting_date", "status_field": "status",
                                        "amount_field": "missing", "alert_filters": '{"gone": 1}', "alert_label": "Gone"})
            self.assertEqual(row, {"source_doctype": "X", "date_field": "posting_date", "status_field": "status"})
            self.assertIsNone(install.clean_source({"source_doctype": "X", "date_field": "missing"}))


class WorkspaceMigrationTests(unittest.TestCase):
    def test_role_sync_preserves_explicit_audience_and_is_idempotent(self):
        from jagadamba import install
        explicit = types.SimpleNamespace(module="Jagadamba", roles=[{"role": "Special User"}])
        empty = Mock(module="Jagadamba", roles=[])
        empty.append.side_effect = lambda field, row: empty.roles.append(row)
        with patch.object(install.frappe, "db") as db, patch.object(install.frappe, "get_doc", create=True) as get_doc:
            db.exists.side_effect = lambda dt, name: dt == "Role" or name in {"Sales Desk", "Production"}
            get_doc.side_effect = lambda dt, name: explicit if name == "Sales Desk" else empty
            install.sync_workspace_roles()
            install.sync_workspace_roles()
        self.assertEqual(explicit.roles, [{"role": "Special User"}])
        self.assertEqual({row["role"] for row in empty.roles}, set(roles_for("production")))
        empty.save.assert_called_once_with(ignore_permissions=True)


class TransactionBoundaryTests(unittest.TestCase):
    def test_project_creation_checks_permissions_and_preserves_submitted_order(self):
        from jagadamba.jagadamba import api
        project = Mock(name="project-document")
        project.name = "PROJ-001"
        order = Mock(docstatus=1, project=None, company="Allowed Co", customer="Customer A",
                     items=[], custom_types="Trading", custom_vehicle_type="", oil_gas_item="")
        with patch.object(api.frappe, "has_permission") as permission, \
             patch.object(api.frappe, "new_doc", create=True, return_value=project), \
             patch.object(api.frappe, "get_doc", create=True, return_value=order) as get_doc:
            result = api.create_project("Project A", sales_order="SO-001")
        permission.assert_called_once_with("Project", "create", throw=True)
        get_doc.assert_called_once_with("Sales Order", "SO-001", for_update=True)
        self.assertEqual([call.args for call in order.check_permission.call_args_list], [("read",), ("write",)])
        project.insert.assert_called_once_with()
        project.update.assert_called_once_with({"custom_types": "Trading"})
        self.assertEqual(project.company, "Allowed Co")
        self.assertEqual(project.customer, "Customer A")
        order.db_set.assert_called_once_with("project", "PROJ-001")
        order.save.assert_not_called()
        self.assertEqual(result, "PROJ-001")

    def test_project_creation_stops_before_insert_on_denied_order(self):
        from jagadamba.jagadamba import api
        project, order = Mock(), Mock()
        order.check_permission.side_effect = PermissionError("Denied")
        with patch.object(api.frappe, "has_permission"), \
             patch.object(api.frappe, "new_doc", create=True, return_value=project), \
             patch.object(api.frappe, "get_doc", create=True, return_value=order):
            with self.assertRaises(PermissionError):
                api.create_project("Denied", sales_order="SO-001")
        project.insert.assert_not_called()

    def test_child_lookup_batches_groups_and_deduplicates_input(self):
        from jagadamba.jagadamba import api
        parent = lambda name: types.SimpleNamespace(name=name, item_group="Parts")
        child = types.SimpleNamespace(item_code="BOLT", item_group="Parts", item_name="Bolt", stock_uom="Nos", description="Bolt")
        with patch.object(api.frappe, "get_list", side_effect=[[parent("P1"), parent("P2")], [child]]) as query:
            result = api.get_child_items_for_parent_items(["P1", "P1", "P2"])
        self.assertEqual(query.call_count, 2)
        self.assertEqual([row["parent_item"] for row in result], ["P1", "P2"])
        self.assertTrue(all("ignore_permissions" not in call.kwargs for call in query.call_args_list))


if __name__ == "__main__":
    unittest.main()
