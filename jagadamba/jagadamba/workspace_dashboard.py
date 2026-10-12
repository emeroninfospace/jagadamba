"""Read-only workspace summaries through Frappe's permission-aware query API.

All identifiers come from SOURCES, never from request input. No shared user-data
cache, raw SQL, get_all, or permission bypass is used by these dashboards.
"""
import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.utils import add_days, add_months, getdate, nowdate

from jagadamba.workspace_config import AUDIENCES, roles_for

# doctype, date field, status field, amount in company currency (if applicable)
SOURCES = {
    "sales": [("Quotation", "transaction_date", "status", "base_grand_total"),
              ("Sales Order", "transaction_date", "status", "base_grand_total")],
    "production": [("Work Order", "planned_start_date", "status", None),
                   ("Job Card", "posting_date", "status", None)],
    "projects": [("Project", "expected_start_date", "status", None),
                 ("Project Budget", "date", "workflow_state", "total_budget_amount")],
    "procurement": [("Material Request", "transaction_date", "status", None),
                    ("Purchase Order", "transaction_date", "status", "base_grand_total")],
    "stores": [("Purchase Receipt", "posting_date", "status", "base_grand_total"),
               ("Stock Entry", "posting_date", "purpose", None)],
    "design": [("Documents", "date", "workflow_state", None),
               ("BOM", "creation", None, None)],
    "accounting": [("Sales Invoice", "posting_date", "status", "base_grand_total"),
                   ("Purchase Invoice", "posting_date", "status", "base_grand_total")],
    "hr": [("Employee", "date_of_joining", "status", None),
           ("Leave Application", "from_date", "status", None)],
    "overview": [("Sales Order", "transaction_date", "status", "base_grand_total"),
                 ("Work Order", "planned_start_date", "status", None),
                 ("Project", "expected_start_date", "status", None),
                 ("Purchase Order", "transaction_date", "status", "base_grand_total")],
}


def check_scope(scope):
    if scope not in AUDIENCES:
        frappe.throw(_("Unknown workspace."))
    if frappe.session.user != "Administrator" and not set(frappe.get_roles()).intersection(roles_for(scope)):
        frappe.throw(_("You do not have access to this workspace."), frappe.PermissionError)


def resolve_period(period, date_from=None, date_to=None):
    today = getdate(nowdate())
    if period == "this_month":
        start, end = today.replace(day=1), today
    elif period == "last_month":
        end = add_days(today.replace(day=1), -1)
        start = end.replace(day=1)
    elif period == "this_year":
        start, end = today.replace(month=1, day=1), today
    elif period == "custom" and date_from and date_to:
        start, end = getdate(date_from), getdate(date_to)
    else:
        frappe.throw(_("Select a valid period and both custom dates."))
    if start > end or (end - start).days > 366:
        frappe.throw(_("Use a date range of at most 367 days, with the start before the end."))
    return start, end


def readable(doctype):
    return frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, "read")


def companies():
    if not readable("Company"):
        return []
    return frappe.get_list("Company", fields=["name", "default_currency"],
                           order_by="name", limit_page_length=0)


def selected_company(company, allowed):
    names = [row.name for row in allowed]
    if company and company not in names:
        frappe.throw(_("You do not have access to this company."), frappe.PermissionError)
    if not names:
        frappe.throw(_("No accessible company. Ask your administrator to check Company permissions."),
                     frappe.PermissionError)
    default = frappe.defaults.get_user_default("Company")
    return company or (default if default in names else names[0])


def source_filters(doctype, company, business_unit):
    meta = frappe.get_meta(doctype)
    filters = {"docstatus": ["!=", 2]}
    if meta.has_field("company"):
        filters["company"] = company
    elif meta.has_field("project"):
        # Use only projects visible to this user; never traverse an unrestricted link.
        if not readable("Project"):
            return None
        projects = frappe.get_list("Project", filters={"company": company}, pluck="name", limit_page_length=0)
        if not projects:
            return None
        filters["project"] = ["in", projects]
    else:
        return None  # Never mix global data into a company-scoped metric.
    if business_unit:
        type_field = "custom_types" if meta.has_field("custom_types") else "type"
        if not meta.has_field(type_field):
            return None
        filters[type_field] = business_unit
    return filters


def summary(source, company, business_unit, start, end):
    doctype, date_field, status_field, amount_field = source
    if not readable(doctype):
        return None
    fields = set(get_permitted_fields(doctype))
    filters = source_filters(doctype, company, business_unit)
    if filters is None or date_field not in fields:
        return None
    # Datetime fields include the full last day, unlike BETWEEN date-only strings.
    period_filters = [[doctype, key, value[0], value[1]] if isinstance(value, list)
                      else [doctype, key, "=", value] for key, value in filters.items()]
    period_filters += [[doctype, date_field, ">=", str(start)],
                       [doctype, date_field, "<", str(add_days(end, 1))]]
    metrics = ["count(distinct name) as total"]
    amount_field = amount_field if amount_field in fields else None
    if amount_field:
        metrics.append(f"sum({amount_field}) as amount")
    totals = frappe.get_list(doctype, filters=period_filters, fields=metrics, order_by="", limit_page_length=1)
    totals = totals[0] if totals else {}
    statuses = []
    if status_field and status_field in fields:
        statuses = frappe.get_list(doctype, filters=period_filters,
            fields=[f"{status_field} as label", "count(distinct name) as value"],
            group_by=status_field, order_by="value desc", limit_page_length=0)
    type_field = "custom_types" if frappe.get_meta(doctype).has_field("custom_types") else "type"
    divisions = []
    if type_field in fields:
        divisions = frappe.get_list(doctype, filters=period_filters,
            fields=[f"{type_field} as label", "count(distinct name) as value"],
            group_by=type_field, order_by="value desc", limit_page_length=0)
    # One grouped query for the entire selected period, rather than one per month.
    date_meta = frappe.get_meta(doctype).get_field(date_field)
    is_datetime = date_field in {"creation", "modified"} or (date_meta and date_meta.fieldtype == "Datetime")
    trend_field = f"date({date_field})" if is_datetime else date_field
    trend = frappe.get_list(doctype, filters=period_filters,
        fields=[f"{trend_field} as date", "count(distinct name) as value"],
        group_by=trend_field, order_by="date", limit_page_length=0)
    months = {}
    cursor = start.replace(day=1)
    while cursor <= end:
        months[cursor.strftime("%Y-%m")] = 0
        cursor = add_months(cursor, 1)
    for row in trend:
        key = getdate(row.date).strftime("%Y-%m")
        months[key] = months.get(key, 0) + row.value
    recent_fields = ["name", date_field]
    if status_field and status_field in fields:
        recent_fields.append(status_field)
    recent = frappe.get_list(doctype, filters=period_filters, fields=recent_fields,
        order_by=f"{date_field} desc, name desc", limit_page_length=6)
    return {
        "doctype": doctype, "total": totals.get("total", 0),
        "amount": totals.get("amount"), "date_field": date_field,
        "status_field": status_field if status_field in fields else None,
        "statuses": statuses, "divisions": divisions,
        "trend": [{"label": label, "value": value} for label, value in months.items()],
        "recent": recent, "filters": period_filters,
        "amount_note": _("Includes drafts; excludes cancelled documents."),
    }


@frappe.whitelist()
def get_dashboard(scope="overview", company=None, business_unit=None, period="this_month",
                  date_from=None, date_to=None):
    check_scope(scope)
    start, end = resolve_period(period, date_from, date_to)
    allowed = companies()
    company = selected_company(company, allowed)
    units = (frappe.get_list("Type", pluck="name", order_by="name", limit_page_length=0)
             if readable("Type") else [])
    if business_unit and business_unit not in units:
        frappe.throw(_("Select an accessible business unit."), frappe.PermissionError)
    sections = [result for source in SOURCES[scope]
                if (result := summary(source, company, business_unit, start, end)) is not None]
    return {
        "scope": scope, "company": company, "companies": allowed, "business_units": units,
        "currency": next((row.get("default_currency") for row in allowed if row.name == company), None),
        "start": start, "end": end, "sections": sections,
        "note": _("Only records you can read are shown. Counts use each document's displayed date field. "
                  "Drafts are included; cancelled documents are excluded. Amounts use company currency. "
                  "Sections without a matching company or business-unit field are omitted."),
    }


def require_legacy_administrator():
    """Old SQL dashboards remain available only to the unrestricted Administrator.

    Their original response contracts are retained for maintenance. Normal Desk
    users use get_dashboard; granting a navigation role cannot unlock raw SQL.
    """
    if frappe.session.user != "Administrator":
        frappe.throw(_("This legacy dashboard is retired. Reload the workspace to use the new dashboard."),
                     frappe.PermissionError)
