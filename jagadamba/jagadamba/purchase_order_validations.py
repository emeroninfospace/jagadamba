import frappe
from frappe.utils import flt


def validate_po(doc, method=None):
    rate_warnings = _get_rate_exceeded_messages(doc)
    item_warnings = _get_invalid_item_messages(doc)

    if rate_warnings:
        msg = "The following items have PO rates exceeding the Sales Order rate:<br><ul>"
        msg += "".join(f"<li>{w}</li>" for w in rate_warnings)
        msg += "</ul>"
        frappe.msgprint(msg, title="Rate Exceeded Warning", indicator="orange")

    if item_warnings:
        msg = "The following PO items are not part of the approved Build Categories for this project:<br><ul>"
        msg += "".join(f"<li>{w}</li>" for w in item_warnings)
        msg += "</ul>"
        frappe.msgprint(msg, title="Invalid PO Items", indicator="orange")


def before_submit_po(doc, method=None):
    errors = []

    rate_issues = _get_rate_exceeded_messages(doc)
    if rate_issues:
        errors.append(
            "<b>PO rate exceeds Sales Order rate — cannot submit:</b><ul>"
            + "".join(f"<li>{e}</li>" for e in rate_issues)
            + "</ul>"
        )

    item_issues = _get_invalid_item_messages(doc)
    if item_issues:
        errors.append(
            "<b>Items not matching approved Build Categories — cannot submit:</b><ul>"
            + "".join(f"<li>{e}</li>" for e in item_issues)
            + "</ul>"
        )

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


def _get_invalid_item_messages(doc):
    if not doc.project:
        return []

    so_name = frappe.db.get_value(
        "Sales Order", {"project": doc.project, "docstatus": 1}, "name"
    )
    if not so_name:
        return []

    valid_codes = {
        r[0]
        for r in frappe.db.sql(
            """
            SELECT item_code FROM `tabQuotation Item Group`
            WHERE parent = %s
              AND parenttype = 'Sales Order'
              AND parentfield = 'custom_item_groups'
            """,
            so_name,
        )
    }

    if not valid_codes:
        return []

    messages = []
    for item in doc.items:
        if item.item_code not in valid_codes:
            messages.append(
                f"<b>{item.item_name or item.item_code}</b> is not a child item of any "
                f"parent item in Sales Order {so_name}"
            )
    return messages
