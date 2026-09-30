import frappe
from frappe.utils import flt


def validate_po(doc, method=None):
    rate_warnings = _get_rate_exceeded_messages(doc)
    budget_warning = _get_budget_exceeded_message(doc)

    if rate_warnings:
        msg = "The following items have PO rates exceeding the Sales Order rate:<br><ul>"
        msg += "".join(f"<li>{w}</li>" for w in rate_warnings)
        msg += "</ul>"
        frappe.msgprint(msg, title="Rate Exceeded Warning", indicator="orange")

    if budget_warning:
        frappe.msgprint(budget_warning, title="Budget Exceeded Warning", indicator="orange")


def before_submit_po(doc, method=None):
    errors = []

    rate_issues = _get_rate_exceeded_messages(doc)
    if rate_issues:
        errors.append(
            "<b>PO rate exceeds Sales Order rate — cannot submit:</b><ul>"
            + "".join(f"<li>{e}</li>" for e in rate_issues)
            + "</ul>"
        )

    budget_issue = _get_budget_exceeded_message(doc)
    if budget_issue:
        if "Accounts User" in frappe.get_roles():
            frappe.msgprint(
                budget_issue
                + "<br><b>Submitted with budget override (Accounts User).</b>",
                title="Budget Exceeded — Override Applied",
                indicator="orange",
            )
        else:
            errors.append(budget_issue)

    if errors:
        frappe.throw("<br>".join(errors), title="Cannot Submit Purchase Order")


def _get_rate_exceeded_messages(doc):
    if not doc.project:
        return []

    so_name = frappe.db.get_value(
        "Sales Order", {"project": doc.project, "docstatus": 1}, "name"
    )
    if not so_name:
        return []

    so_rates = {
        row[0]: flt(row[1])
        for row in frappe.db.sql(
            "SELECT item_code, rate FROM `tabSales Order Item` WHERE parent = %s",
            so_name,
        )
    }

    messages = []
    for item in doc.items:
        so_rate = so_rates.get(item.item_code)
        if so_rate is None:
            continue
        po_rate = flt(item.rate)
        if po_rate > so_rate:
            messages.append(
                f"<b>{item.item_name or item.item_code}</b>: "
                f"PO rate {po_rate:,.2f} exceeds Sales Order rate {so_rate:,.2f}"
            )
    return messages


def _get_budget_exceeded_message(doc):
    if not doc.project:
        return None

    budget_name = frappe.db.get_value(
        "Project Budget",
        {"project": doc.project, "docstatus": 1},
        "name",
    )
    if not budget_name:
        return None

    procurement_budget = flt(
        frappe.db.sql(
            """
            SELECT IFNULL(SUM(budget_amount), 0)
            FROM `tabProject Budget WBS`
            WHERE parent = %s AND main_wbs = 'Procurement'
            """,
            budget_name,
        )[0][0]
    )

    if not procurement_budget:
        return None

    already_committed = flt(
        frappe.db.sql(
            """
            SELECT IFNULL(SUM(grand_total), 0)
            FROM `tabPurchase Order`
            WHERE project = %s AND docstatus = 1 AND name != %s
            """,
            (doc.project, doc.name or ""),
        )[0][0]
    )

    projected_total = already_committed + flt(doc.grand_total)

    if projected_total > procurement_budget:
        excess = projected_total - procurement_budget
        return (
            f"<b>Procurement Budget Exceeded</b> for project <b>{doc.project}</b>:<br>"
            f"Procurement WBS Budget: <b>{procurement_budget:,.2f}</b><br>"
            f"Already Committed (submitted POs): <b>{already_committed:,.2f}</b><br>"
            f"This PO: <b>{flt(doc.grand_total):,.2f}</b><br>"
            f"Projected Total: <b>{projected_total:,.2f}</b><br>"
            f"Excess: <b>{excess:,.2f}</b>"
        )

    return None
