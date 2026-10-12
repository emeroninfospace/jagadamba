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
    for name in ("get_roles", "get_list", "has_permission", "get_meta", "throw"):
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

    def test_sales_role_cannot_read_hr(self):
        with self.assertRaises(PermissionError):
            dashboard.check_scope("hr")
        dashboard.check_scope("sales")
        dashboard.check_scope("overview")

    def test_unknown_scope_rejected(self):
        with self.assertRaises(ValueError):
            dashboard.check_scope("tabSalary Slip")

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
            self.assertIsNone(dashboard.summary(dashboard.SOURCES["sales"][0], "Allowed", None, date(2026, 10, 1), date(2026, 10, 12)))
        query.assert_not_called()

    def test_queries_keep_company_and_row_permissions_and_end_date(self):
        meta = types.SimpleNamespace(has_field=lambda field: field in {"company", "custom_types"},
            get_field=lambda field: types.SimpleNamespace(fieldtype="Date"))
        self.stub("get_meta", return_value=meta)
        responses = [[{"total": 2, "amount": 100}], [], [],
            [types.SimpleNamespace(date="2026-10-12", value=2)], []]
        query = self.stub("get_list", side_effect=responses)
        fields = ["name", "company", "custom_types", "transaction_date", "status", "base_grand_total"]
        with patch.object(dashboard, "readable", return_value=True), patch.object(dashboard, "get_permitted_fields", return_value=fields):
            result = dashboard.summary(dashboard.SOURCES["sales"][0], "Allowed Co", "Trading", date(2026, 10, 1), date(2026, 10, 12))
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["trend"], [{"label": "2026-10", "value": 2}])
        self.assertEqual(query.call_count, 5)
        for call in query.call_args_list:
            args = call.kwargs
            self.assertNotIn("ignore_permissions", args)
            self.assertIn(["Quotation", "company", "=", "Allowed Co"], args["filters"])
            self.assertIn(["Quotation", "custom_types", "=", "Trading"], args["filters"])
            self.assertIn(["Quotation", "transaction_date", "<", "2026-10-13"], args["filters"])

    def test_restricted_amount_is_not_queried(self):
        self.stub("get_meta", return_value=types.SimpleNamespace(has_field=lambda f: f == "company",
            get_field=lambda f: types.SimpleNamespace(fieldtype="Date")))
        query = self.stub("get_list", side_effect=[[{"total": 0}], [], []])
        with patch.object(dashboard, "readable", return_value=True), patch.object(dashboard, "get_permitted_fields", return_value=["name", "transaction_date"]):
            result = dashboard.summary(dashboard.SOURCES["sales"][0], "Allowed", None, date(2026, 10, 1), date(2026, 10, 12))
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
