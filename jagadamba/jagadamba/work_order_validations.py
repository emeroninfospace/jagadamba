import frappe
from frappe.utils import flt


def validate_wo(doc, method=None):
    warning = _get_production_budget_exceeded_message(doc)
    if warning:
        frappe.msgprint(warning, title="Production Budget Warning", indicator="orange")


def before_submit_wo(doc, method=None):
    error = _get_production_budget_exceeded_message(doc)
    if not error:
        return

    if "Accounts User" in frappe.get_roles():
        frappe.msgprint(
            error + "<br><b>Submitted with budget override (Accounts User).</b>",
            title="Budget Exceeded — Override Applied",
            indicator="orange",
        )
        return

    frappe.throw(error, title="Cannot Submit Work Order")


def _get_production_budget_exceeded_message(doc):
    if not doc.project:
        return None

    main_wbs = doc.get("custom_main_wbs")
    if not main_wbs:
        return None

    budget_name = frappe.db.get_value(
        "Project Budget",
        {"project": doc.project, "docstatus": 1},
        "name",
    )
    if not budget_name:
        return None

    wbs_budget = flt(
        frappe.db.sql(
            """
            SELECT IFNULL(SUM(budget_amount), 0)
            FROM `tabProject Budget WBS`
            WHERE parent = %s AND main_wbs = %s
            """,
            (budget_name, main_wbs),
        )[0][0]
    )

    if not wbs_budget:
        return None

    already_committed = flt(
        frappe.db.sql(
            """
            SELECT IFNULL(SUM(planned_operating_cost), 0)
            FROM `tabWork Order`
            WHERE project = %s AND custom_main_wbs = %s AND docstatus = 1 AND name != %s
            """,
            (doc.project, main_wbs, doc.name or ""),
        )[0][0]
    )

    projected_total = already_committed + flt(doc.planned_operating_cost)

    if projected_total > wbs_budget:
        excess = projected_total - wbs_budget
        return (
            f"<b>{main_wbs} Budget Exceeded</b> for project <b>{doc.project}</b>:<br>"
            f"{main_wbs} WBS Budget: <b>{wbs_budget:,.2f}</b><br>"
            f"Already Committed (submitted Work Orders): <b>{already_committed:,.2f}</b><br>"
            f"This Work Order: <b>{flt(doc.planned_operating_cost):,.2f}</b><br>"
            f"Projected Total: <b>{projected_total:,.2f}</b><br>"
            f"Excess: <b>{excess:,.2f}</b>"
        )

    return None
