import frappe
from frappe.utils import getdate, nowdate, add_days, flt


@frappe.whitelist()
def get_hr_dashboard_data(date_from=None, date_to=None, employee=None, company=None):
	company = company or _default_company()
	today = getdate(nowdate())

	if date_from and date_to:
		start, end = getdate(date_from), getdate(date_to)
	else:
		start, end = today.replace(day=1), today

	data = {
		"kpis": get_kpis(company, today),
		"net_pay_distribution": get_net_pay_distribution(company, start, end, employee),
		"upcoming_birthdays": get_upcoming_birthdays(company, today),
		"upcoming_holidays": get_upcoming_holidays(company, today),
		"recent_leave_applications": get_recent_leave_applications(company),
	}
	return data


@frappe.whitelist()
def search_employees(txt=""):
	return frappe.db.sql(
		"""
		SELECT name, employee_name
		FROM `tabEmployee`
		WHERE status = 'Active' AND (employee_name LIKE %(txt)s OR name LIKE %(txt)s)
		ORDER BY employee_name ASC
		LIMIT 20
		""",
		{"txt": "%{0}%".format(txt)},
		as_dict=True,
	)


def _default_company():
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if not company:
		company = frappe.db.get_value("Company", {}, "name", order_by="creation asc")
	return company


def get_kpis(company, today):
	active_employees = frappe.db.count("Employee", {"status": "Active", "company": company})

	on_leave_today = frappe.db.sql(
		"""
		SELECT COUNT(DISTINCT employee) FROM `tabLeave Application`
		WHERE docstatus = 1 AND status = 'Approved'
			AND %s BETWEEN from_date AND to_date
		""",
		(today,),
	)[0][0] or 0

	birthdays_this_month = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabEmployee`
		WHERE status = 'Active' AND company = %s
			AND date_of_birth IS NOT NULL
			AND MONTH(date_of_birth) = MONTH(%s)
		""",
		(company, today),
	)[0][0] or 0

	upcoming_holidays_count = len(get_upcoming_holidays(company, today, limit=100, within_days=30))

	return {
		"active_employees": active_employees,
		"on_leave_today": on_leave_today,
		"birthdays_this_month": birthdays_this_month,
		"upcoming_holidays": upcoming_holidays_count,
	}


def get_net_pay_distribution(company, start, end, employee=None):
	conditions = ["ss.docstatus = 1", "ss.company = %(company)s"]
	params = {"company": company, "start": start, "end": end}
	conditions.append("ss.start_date <= %(end)s AND ss.end_date >= %(start)s")

	if employee:
		conditions.append("(ss.employee = %(employee)s OR ss.employee_name LIKE %(employee_like)s)")
		params["employee"] = employee
		params["employee_like"] = "%{0}%".format(employee)

	rows = frappe.db.sql(
		"""
		SELECT ss.employee, ss.employee_name, SUM(ss.net_pay) AS net_pay
		FROM `tabSalary Slip` ss
		WHERE {conditions}
		GROUP BY ss.employee
		HAVING net_pay > 0
		ORDER BY net_pay DESC
		LIMIT 12
		""".format(conditions=" AND ".join(conditions)),
		params,
		as_dict=True,
	)

	total = sum(flt(r.net_pay) for r in rows)
	return {"rows": rows, "total_payout": total}


def get_upcoming_birthdays(company, today, limit=5, within_days=60):
	employees = frappe.db.sql(
		"""
		SELECT name, employee_name, date_of_birth, department
		FROM `tabEmployee`
		WHERE status = 'Active' AND company = %s AND date_of_birth IS NOT NULL
		""",
		(company,),
		as_dict=True,
	)

	result = []
	for emp in employees:
		dob = getdate(emp.date_of_birth)
		try:
			this_year_bday = dob.replace(year=today.year)
		except ValueError:
			# Feb 29 on a non-leap year
			this_year_bday = dob.replace(year=today.year, day=28)
		if this_year_bday < today:
			try:
				this_year_bday = dob.replace(year=today.year + 1)
			except ValueError:
				this_year_bday = dob.replace(year=today.year + 1, day=28)
		delta = (this_year_bday - today).days
		if delta <= within_days:
			emp["next_birthday"] = this_year_bday
			emp["days_away"] = delta
			result.append(emp)

	result.sort(key=lambda x: x["days_away"])
	return result[:limit]


def get_upcoming_holidays(company, today, limit=5, within_days=180):
	holiday_list = frappe.db.get_value("Company", company, "default_holiday_list")
	if not holiday_list:
		return []

	rows = frappe.db.sql(
		"""
		SELECT holiday_date, description
		FROM `tabHoliday`
		WHERE parent = %s AND holiday_date >= %s AND holiday_date <= %s
		ORDER BY holiday_date ASC
		LIMIT %s
		""",
		(holiday_list, today, add_days(today, within_days), limit),
		as_dict=True,
	)
	return rows


def get_recent_leave_applications(company, limit=8):
	return frappe.db.sql(
		"""
		SELECT la.name, la.employee_name, la.leave_type, la.from_date, la.to_date, la.status
		FROM `tabLeave Application` la
		LEFT JOIN `tabEmployee` e ON e.name = la.employee
		WHERE la.docstatus != 2 AND (e.company = %s OR e.company IS NULL)
		ORDER BY la.creation DESC
		LIMIT %s
		""",
		(company, limit),
		as_dict=True,
	)