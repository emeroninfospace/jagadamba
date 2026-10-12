"""Read-only workspace summaries through Frappe's permission-aware query API.

Dashboards are configured in Jagadamba Workspace Profile records (see
workspace_profiles.json for the seeded defaults). Every identifier used in a query
is checked against the DocType meta and the current user's permitted fields; request
input only selects a profile, company, business unit and period. No shared user-data
cache, raw SQL, get_all, or permission bypass is used for dashboard data.
"""
import json

import frappe
from frappe import _
from frappe.model import get_permitted_fields
from frappe.utils import add_days, add_months, getdate, nowdate

from jagadamba.workspace_config import MANAGERS

PROFILE = "Jagadamba Workspace Profile"
NUMERIC_TYPES = {"Currency", "Float", "Int", "Percent"}
STANDARD_FIELDS = {"name", "owner", "creation", "modified", "modified_by", "docstatus"}
FILTER_OPERATORS = {"=", "!=", ">", "<", ">=", "<=", "in", "not in", "like", "not like",
                    "between", "is", "descendants of", "ancestors of"}
PERIODS = ("this_month", "last_month", "this_quarter", "this_year", "custom")
RECENT_LIMIT = 6
TOP_LIMIT = 5


def get_profile(scope):
    if not isinstance(scope, str) or not scope or not frappe.db.exists(PROFILE, scope):
        frappe.throw(_("Unknown workspace."))
    profile = frappe.get_cached_doc(PROFILE, scope)
    if not profile.enabled:
        frappe.throw(_("This workspace dashboard is disabled."))
    return profile


def check_scope(scope):
    profile = get_profile(scope)
    allowed = set(MANAGERS).union(row.role for row in profile.roles)
    if frappe.session.user != "Administrator" and not allowed.intersection(frappe.get_roles()):
        frappe.throw(_("You do not have access to this workspace."), frappe.PermissionError)
    return profile


def resolve_period(period, date_from=None, date_to=None):
    today = getdate(nowdate())
    if period == "this_month":
        start, end = today.replace(day=1), today
    elif period == "last_month":
        end = add_days(today.replace(day=1), -1)
        start = end.replace(day=1)
    elif period == "this_quarter":
        start, end = today.replace(month=(today.month - 1) // 3 * 3 + 1, day=1), today
    elif period == "this_year":
        start, end = today.replace(month=1, day=1), today
    elif period == "custom" and date_from and date_to:
        start, end = getdate(date_from), getdate(date_to)
    else:
        frappe.throw(_("Select a valid period and both custom dates."))
    if start > end or (end - start).days > 366:
        frappe.throw(_("Use a date range of at most 367 days, with the start before the end."))
    return start, end


def previous_period(start, end):
    previous_end = add_days(start, -1)
    return add_days(previous_end, -(end - start).days), previous_end


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


def business_unit_field(meta):
    return "custom_types" if meta.has_field("custom_types") else "type"


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
        type_field = business_unit_field(meta)
        if not meta.has_field(type_field):
            return None
        filters[type_field] = business_unit
    return filters


def resolve_token(value):
    """Replace @today, @today+N, @today-N and @user in configured filter values."""
    if isinstance(value, list):
        return [resolve_token(item) for item in value]
    if not isinstance(value, str) or not value.startswith("@"):
        return value
    if value == "@user":
        return frappe.session.user
    if value.startswith("@today"):
        offset = value[len("@today"):]
        try:
            return str(add_days(getdate(nowdate()), int(offset or 0)))
        except ValueError:
            pass
    frappe.throw(_("Unsupported dashboard filter value {0}.").format(value))


def configured_filters(text, fields):
    """Parse a profile JSON filter. Returns None when a field is not readable by this user."""
    if not text:
        return {}
    try:
        raw = json.loads(text) if isinstance(text, str) else text
    except ValueError:
        return None
    if not isinstance(raw, dict):
        return None
    parsed = {}
    for key, value in raw.items():
        if key not in fields and key not in STANDARD_FIELDS:
            return None
        if isinstance(value, list):
            if len(value) != 2 or value[0] not in FILTER_OPERATORS:
                return None
            parsed[key] = [value[0], resolve_token(value[1])]
        else:
            parsed[key] = resolve_token(value)
    return parsed


def as_filter_list(doctype, filters):
    return [[doctype, key, value[0], value[1]] if isinstance(value, list)
            else [doctype, key, "=", value] for key, value in filters.items()]


def date_window(doctype, date_field, start, end):
    # Datetime fields include the full last day, unlike BETWEEN date-only strings.
    return [[doctype, date_field, ">=", str(start)], [doctype, date_field, "<", str(add_days(end, 1))]]


def field_or_none(fieldname, fields):
    return fieldname if fieldname and fieldname in fields else None


def summary(source, company, business_unit, start, end):
    doctype = source.source_doctype
    if not readable(doctype):
        return None
    meta = frappe.get_meta(doctype)
    fields = set(get_permitted_fields(doctype)) | {"name", "creation", "modified"}
    date_field = source.date_field
    base = source_filters(doctype, company, business_unit)
    extra = configured_filters(source.get("extra_filters"), fields)
    if base is None or extra is None or date_field not in fields:
        return None
    base.update(extra)
    base_filters = as_filter_list(doctype, base)
    period_filters = base_filters + date_window(doctype, date_field, start, end)
    status_field = field_or_none(source.get("status_field"), fields)
    party_field = field_or_none(source.get("party_field"), fields)
    amount_field = field_or_none(source.get("amount_field"), fields)
    second_field = field_or_none(source.get("secondary_amount_field"), fields)

    metrics = ["count(distinct name) as total"]
    if amount_field:
        metrics.append(f"sum({amount_field}) as amount")
    if second_field:
        metrics.append(f"sum({second_field}) as secondary")
    totals = frappe.get_list(doctype, filters=period_filters, fields=metrics, order_by="", limit_page_length=1)
    totals = totals[0] if totals else {}

    previous_start, previous_end = previous_period(start, end)
    previous = frappe.get_list(doctype, filters=base_filters + date_window(doctype, date_field, previous_start, previous_end),
                               fields=metrics[:2], order_by="", limit_page_length=1)
    previous = previous[0] if previous else {}

    def grouped(fieldname, limit=0):
        group_metrics = [f"{fieldname} as label", "count(distinct name) as value"]
        if amount_field:
            group_metrics.append(f"sum({amount_field}) as amount")
        order = "amount desc" if amount_field and limit else "value desc"
        return frappe.get_list(doctype, filters=period_filters, fields=group_metrics,
                               group_by=fieldname, order_by=order, limit_page_length=limit)

    statuses = grouped(status_field) if status_field else []
    type_field = business_unit_field(meta)
    divisions = grouped(type_field) if type_field in fields else []
    top = grouped(party_field, TOP_LIMIT) if party_field else []

    # One grouped query for the entire selected period, rather than one per month.
    date_meta = meta.get_field(date_field)
    is_datetime = date_field in {"creation", "modified"} or (date_meta and date_meta.fieldtype == "Datetime")
    trend_field = f"date({date_field})" if is_datetime else date_field
    trend_metrics = [f"{trend_field} as date", "count(distinct name) as value"]
    if amount_field:
        trend_metrics.append(f"sum({amount_field}) as amount")
    trend = frappe.get_list(doctype, filters=period_filters, fields=trend_metrics,
                            group_by=trend_field, order_by="date", limit_page_length=0)
    months = {}
    cursor = start.replace(day=1)
    while cursor <= end:
        months[cursor.strftime("%Y-%m")] = {"label": cursor.strftime("%Y-%m"), "value": 0, "amount": 0}
        cursor = add_months(cursor, 1)
    for row in trend:
        bucket = months.setdefault(getdate(row.date).strftime("%Y-%m"),
                                   {"label": getdate(row.date).strftime("%Y-%m"), "value": 0, "amount": 0})
        bucket["value"] += row.value
        bucket["amount"] += row.get("amount") or 0

    recent_fields = ["name", date_field] + [f for f in (status_field, party_field, amount_field) if f]
    recent = frappe.get_list(doctype, filters=period_filters, fields=list(dict.fromkeys(recent_fields)),
                             order_by=f"{date_field} desc, name desc", limit_page_length=RECENT_LIMIT)

    alert = None
    alert_extra = configured_filters(source.get("alert_filters"), fields) if source.get("alert_filters") else None
    if alert_extra:
        alert_filters = as_filter_list(doctype, {**base, **alert_extra})
        count = frappe.get_list(doctype, filters=alert_filters, fields=["count(distinct name) as total"],
                                order_by="", limit_page_length=1)
        alert = {"label": source.get("alert_label") or _("Needs attention"),
                 "count": (count[0].get("total") if count else 0) or 0, "filters": alert_filters}

    return {
        "key": source.name, "doctype": doctype, "label": source.get("label") or doctype,
        "color": source.get("color"), "total": totals.get("total") or 0,
        "previous_total": previous.get("total") or 0,
        "amount": totals.get("amount") if amount_field else None,
        "previous_amount": previous.get("amount") if amount_field else None,
        "amount_label": source.get("amount_label") or _("Value"),
        "secondary_amount": totals.get("secondary") if second_field else None,
        "secondary_amount_label": source.get("secondary_amount_label") or _("Second value"),
        "date_field": date_field, "date_label": _(meta.get_label(date_field)) if meta.get_field(date_field) else _("Created On"),
        "status_field": status_field, "party_field": party_field,
        "party_label": _(meta.get_label(party_field)) if party_field and meta.get_field(party_field) else None,
        "amount_field": amount_field, "statuses": statuses, "divisions": divisions, "top": top,
        "trend": list(months.values()), "recent": recent, "alert": alert, "filters": period_filters,
    }


@frappe.whitelist()
def get_dashboard(scope="overview", company=None, business_unit=None, period="this_month",
                  date_from=None, date_to=None):
    profile = check_scope(scope)
    start, end = resolve_period(period, date_from, date_to)
    allowed = companies()
    company = selected_company(company, allowed)
    units = (frappe.get_list("Type", pluck="name", order_by="name", limit_page_length=0)
             if readable("Type") else [])
    if business_unit and business_unit not in units:
        frappe.throw(_("Select an accessible business unit."), frappe.PermissionError)
    sections = [result for source in profile.sources if source.enabled
                if (result := summary(source, company, business_unit, start, end)) is not None]
    previous_start, previous_end = previous_period(start, end)
    return {
        "scope": scope, "title": profile.title, "eyebrow": profile.eyebrow, "subtitle": profile.subtitle,
        "accent": profile.accent_color, "company": company, "companies": allowed, "business_units": units,
        "currency": next((row.get("default_currency") for row in allowed if row.name == company), None),
        "start": start, "end": end, "previous_start": previous_start, "previous_end": previous_end,
        "sections": sections,
        "note": _("Only records you can read are shown. Counts use each section's date field and are compared "
                  "with the previous period of equal length. Drafts are included unless a section filters them; "
                  "cancelled documents are excluded. Amounts use company currency fields. Attention counts show "
                  "the current state, regardless of period. Sections without a matching company or business-unit "
                  "field are omitted."),
    }


def home_profile(roles):
    """Lowest-priority enabled profile whose landing roles match, with a readable home workspace."""
    if not frappe.db.exists("DocType", PROFILE):
        return None
    roles = set(roles)
    profiles = frappe.get_all(PROFILE, filters={"enabled": 1, "home_workspace": ["is", "set"]},
                              fields=["name", "home_workspace", "landing_priority"],
                              order_by="landing_priority asc, name asc")
    for profile in profiles:
        landing = set(frappe.get_all("Has Role", filters={"parenttype": PROFILE, "parent": profile.name,
                                                          "parentfield": "landing_roles"}, pluck="role"))
        if landing & roles:
            return profile
    return None


def require_legacy_administrator():
    """Old SQL dashboards remain available only to the unrestricted Administrator.

    Their original response contracts are retained for maintenance. Normal Desk
    users use get_dashboard; granting a navigation role cannot unlock raw SQL.
    """
    if frappe.session.user != "Administrator":
        frappe.throw(_("This legacy dashboard is retired. Reload the workspace to use the new dashboard."),
                     frappe.PermissionError)
