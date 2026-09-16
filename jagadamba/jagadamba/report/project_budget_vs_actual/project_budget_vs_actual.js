// Copyright (c) 2026, Emeron Infospace and contributors
// For license information, please see license.txt

frappe.query_reports["Project Budget vs Actual"] = {
	"filters": [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "fiscal_year",
			label: __("Fiscal Year"),
			fieldtype: "Link",
			options: "Fiscal Year",
		},
		{
			fieldname: "project",
			label: __("Project"),
			fieldtype: "Link",
			options: "Project",
		},
		{
			fieldname: "from_date",
			label: __("PO From Date"),
			fieldtype: "Date",
		},
		{
			fieldname: "to_date",
			label: __("PO To Date"),
			fieldtype: "Date",
		},
	],
};
