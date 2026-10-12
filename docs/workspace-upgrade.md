# Jagadamba workspace upgrade

This change targets Frappe/ERPNext v15. It has not been deployed to a client site. HRMS remains necessary for the existing Employee customizations and HR features; the overview omits unavailable or unreadable document types.

## Role-based desks (dynamic)

Every dashboard is driven by a **Jagadamba Workspace Profile** record (Desk → search "Jagadamba Workspace Profile"). Nothing about which documents, fields, alerts or audiences a dashboard shows is hard-coded in the page script; a System Manager edits the profile and the change applies on the next refresh.

Each profile holds:

- **Headline, eyebrow, subtitle and accent colour** for the animated hero.
- **Home Workspace, Landing Roles and Landing Priority.** After login, a user without a Default Workspace on their User record opens the home workspace of the lowest-priority profile whose landing roles they hold. A Default Workspace set on the User always wins.
- **Dashboard Roles.** Who may load the dashboard (System Manager and Management always can). Document permissions still apply to every number.
- **Sources** (one row per section): document type, date field, status field, "top by" field, amount and second amount fields, base filters and an *attention* filter (for example overdue invoices). Filters are JSON and accept `@today`, `@today+N`, `@today-N` and `@user`. Field names are validated against the DocType when saved and against the viewer's permitted fields when loaded.

Shipped defaults live in `jagadamba/workspace_profiles.json`. They are inserted only when a profile is missing, so edited profiles are never overwritten by migrate. Fields the site does not have (for example without HRMS) are dropped from the seed.

Default landing, matched to the ERP user list:

| Landing roles | Lands on | Priority |
| --- | --- | --- |
| Management, System Manager | Jagadamba | 10 |
| Sales Executive / User / Manager | Sales Desk | 20 |
| Finance Manager, Accounts Manager / User | Accounting Overview | 25 |
| HR Manager / User | HR Overview | 25 |
| Procurement Engineer, Purchase Manager / User | Procurement Desk | 30 |
| Production Engineer, Manufacturing Manager / User | Production | 30 |
| Quality Engineer, Quality Manager | Quality Desk | 35 |
| Project Engineer, Projects Manager / User | Project Desk | 40 |
| Design Engineer, Engineering Head | Design | 40 |
| Stores User, Stock Manager / User | Stores | 45 |
| Delivery Manager / User | Logistics Desk | 50 |
| Maintenance Manager / User | Maintenance Desk | 50 |

So a user with Sales Executive + Design Engineer + Project Engineer lands on Sales Desk, Stores User + Procurement Engineer lands on Procurement Desk, and Production Engineer + Design Engineer lands on Production. Users still see every other workspace their roles allow in the sidebar.

## Dashboard contents

Each section shows: a KPI card with animated count, change against the previous period of equal length, value total and sparkline; an attention chip (current state, regardless of period) that opens the matching list; a status donut; monthly count or value columns; the top five by the configured field; business-unit mix; and recent records with party, amount and status. Every chart element drills into the filtered List view. Quick-create buttons appear for document types the user may create. Period options are this month, last month, this quarter, this year and custom (up to 367 days).

The Accounting desk now shows booked sales and purchase invoices with receivable/payable outstanding and overdue counts, customer receipts, supplier payments and journal entries. HR shows new joiners (with visas expiring in 30 days), leave, attendance, expense claims and salary slips.

## Classic overview layout (Accounting)

A profile's **Layout** can be *Modern* (gradient hero) or *Classic*. Classic shows a compact header (company initials, company name, title, today's date, period selector, Refresh) in a paper-toned style that also has a dark version. Any layout can add:

- **Snapshot Cards** (child table): label, icon, colour, document type, Count or Sum of a field, optional period date field, filters, an optional second count and a caption using `{count}`, `{secondary}`, `{start}` and `{end}`. Cards without a date field show the current state. Masters without a Company field (for example Customer) can be marked *Not Company-Specific*. Each card opens the matching list.
- **Comparison Chart** (child table of series): monthly grouped bars for each series (for example Sales Invoice vs Purchase Invoice net totals), with totals, an optional difference such as **Profit**, a hover tooltip with the month's profit and margin, its own date range with Apply/Reset, and click-through to the month's records.

Accounting Overview ships with Classic and eight cards (Customers, Active Projects, Open Tasks, Payment Received, Receivable, Quotations, Payable, Sales Orders) plus Sales vs Purchase with Profit. Existing profiles that have no cards or chart receive these once on migrate; edited profiles are left alone. Profit here is booked sales minus booked purchases (net of taxes) for the period, not an accounting profit and loss figure.

## New and updated workspaces

- New: **Quality Desk**, **Logistics Desk**, **Maintenance Desk** (with matching Custom HTML Blocks and profiles).
- Every workspace has a Quick Access row of shortcuts with live counts (for example "3 To Bill", "5 Pending") and cards for documents, reports and masters. Accounting and HR, which previously only had the summary block, now carry full shortcut, report and master cards (General Ledger, Trial Balance, P&L, Balance Sheet, Cash Flow, AR/AP, Gross Profit, UAE VAT 201, Monthly Attendance Sheet, Leave Balance, Salary Register and more).
- All report and DocType links were checked against ERPNext v15, HRMS v15 and Frappe v15. Links to DocTypes or reports that a site does not have are hidden by Frappe.

## Form layout

Lead's header is regrouped into three columns: name, lead details (owner, status, source, type) and customer & business unit (customer, company, Type, Vehicle Type, Job Item). Sales Order, Opportunity and Purchase Receipt now keep Type, Vehicle Type and Job Item together.

## Earlier changes (previous upgrade)

## What changes

- Nine shared dashboard configurations serve the existing twelve workspaces, with responsive cards, monthly activity bars, status breakdowns, business-unit mix and recent records.
- Company and business-unit filters are applied in server queries. Business-unit choices come from readable Type records, including the seeded Oil & Gas, Trailers and Trading values.
- Workspace and Custom HTML Block roles replace sidebar DOM hiding, prototype patching, repeated observers and changes to users' default workspace settings.
- User defaults and private/standard workspaces remain under Frappe's normal navigation rules. Set **Default Workspace** on a User to choose their landing page.
- All new dashboard data queries use `frappe.get_list`, with the current user's document, row and field permissions. No cross-user data cache is introduced. Workspace roles do not grant transaction permissions.
- Each readable document source runs at most eight grouped/list queries (totals, previous period, status, business unit, top five, trend, recent, attention), independent of record count or number of months. Recent records are limited to six. Project-linked documents without a company field use the user's readable projects. Large project lists should be profiled on client data before production rollout.
- Amounts use company-currency fields. Invoice and order totals include drafts and exclude cancelled records; these are activity summaries, not booked revenue, gross profit or ledger balances.
- Dates use each displayed source date field (for example, planned start for Work Orders and expected start for Projects). Undated documents are not included in period summaries. Custom periods are limited to 367 inclusive days.
- Sources with no safe company scope, an unreadable date field, or no business-unit field for the selected unit are omitted rather than displaying an unfiltered total.
- Motion is limited to short entry/bar transitions and hover feedback. Reduced-motion preferences disable it. Colors inherit the Desk theme, including inside the HTML block's shadow root.
- Stale responses, detached workspace blocks, empty results and failed requests are handled without showing data from the previous company selection. Labels are inserted as text, not interpolated HTML.

## Workspace audiences

System Manager and Management can access each dashboard but still need the underlying document permissions. Administrator retains normal full access.

| Workspace | Additional audience |
| --- | --- |
| Sales Desk / Sales Overview | Sales Executive, Sales User, Sales Manager |
| Production / Production Overview | Production Engineer, Manufacturing User, Manufacturing Manager, Quality Engineer |
| Project Desk / Project Overview | Project Engineer, Projects User, Projects Manager, Engineering Head |
| Procurement Desk | Procurement Engineer, Purchase User, Purchase Manager |
| Stores | Stores User, Stock User, Stock Manager |
| Design | Design Engineer, Engineering Head |
| Accounting Overview | Finance Manager, Accounts User, Accounts Manager |
| HR Overview | HR User, HR Manager |
| Quality Desk | Quality Engineer, Quality Manager |
| Logistics Desk | Delivery Manager, Delivery User |
| Maintenance Desk | Maintenance Manager, Maintenance User |
| Jagadamba | Union of the above audiences |

The Type master receives read/select permissions for these audiences; only the existing System Manager permission grants edits. No business transaction roles or user assignments are created. Role policy lives in `jagadamba/workspace_config.py`; update both exported roles and API policy together if changing audiences. The migration hook fills only empty role tables on Jagadamba-owned workspaces and preserves already configured audiences. Standard app JSON synchronization can refresh the exported app layouts; retain a backup of client-specific edits before migration.

## Compatibility changes requiring staging review

The five old overview blocks are replaced by the shared operational summary. Their old detailed widgets (ledger profitability and aging, payroll distribution, WBS/item variance, production kanban and stage pipelines) are not reproduced in the new summary. Existing document links and operational shortcuts remain, and ERPNext's standard reports remain available according to permissions. Confirm the client's required detailed dashboard views before promoting this draft; this change is not a feature-parity claim for those widgets.

The previous dashboard APIs used raw SQL or `get_all` without user-scope filtering. They now reject every caller except the literal `Administrator` user. This includes the legacy HR employee search and Project detail/item drill-down endpoints. Their response contracts are retained for Administrator maintenance, but old client scripts or custom blocks calling them as regular users must migrate to `jagadamba.jagadamba.workspace_dashboard.get_dashboard`. Merely granting System Manager or Management does not unlock these legacy APIs. Refresh assets and migrate fixtures together.

Standalone exported Number Cards are retained, but old embedded cards/charts are replaced in the workspace layouts. This removes references to eight cards absent from the repository and avoids reliance on external chart names. `Total Budgeted Value` is corrected from Count to Sum of `total_budget_amount`.

## Application fixes

- Document builders verify source read and target create permissions. Existing drawing/budget links require read access before being returned.
- Project creation no longer uses `ignore_permissions=True`, writes debug messages to Error Log, or updates its custom fields after validation. It obtains customer/company from the submitted Sales Order, rejects mismatched customers, and checks Sales Order read/write permissions.
- The Sales Order is locked while creating/linking a Project. If it already has a readable Project, that Project is returned rather than overwritten. Linking the submitted order uses one explicit `db_set` after the permission checks, because ERPNext v15 does not mark that field `allow_on_submit`; it does not re-save/recalculate the order.
- Fiscal year lookup uses `erpnext.accounts.utils.get_fiscal_year` and the source Project's company, and no longer silently swallows configuration errors.
- Child-item expansion batches parent/group reads into two permission-aware queries, deduplicates input and limits requests to 100 parent codes.
- Purchase Order item lookup respects parent permissions and field-level query filtering.
- Type seeding participates in the install transaction without an intermediate commit.

## Validation

Completed locally:

- 26 Python unit/boundary tests, using mocks rather than a live database (including role-based landing for each department in the user list).
- Chromium browser test (desktop, mobile, dark, reduced motion) and DOM tests for rendering, literal text safety, list filters, idempotent mounting, stale response rejection, error recovery, custom dates and detached blocks.
- Python compile checks, JavaScript syntax checks and JSON/export reference checks.

Not completed locally:

- A running Frappe/ERPNext/HRMS site, real SQL execution and real user-permission enforcement.
- Financial reconciliation, workflow end-to-end tests, performance measurements on client data, or a complete audit of every app method.

```bash
python -m unittest discover -s tests -v
python -m compileall -q jagadamba
node --check jagadamba/public/js/workspace_dashboard.js
# With jsdom available in your Node environment:
node tests/workspace_dashboard.dom.cjs
# With Playwright and its Chromium browser available (CHROMIUM_PATH optional):
node tests/workspace_dashboard.browser.cjs
```

CI is aligned to the repository's main branch and a v15 Frappe/ERPNext/HRMS installation. CI results must be checked separately; changing the workflow does not establish that integration tests passed.

## Staging rollout

Use a recent client backup on a staging site. After checking out this branch in the app directory, run from the bench directory (replace `staging.example.com`):

```bash
bench --site staging.example.com backup --with-files
bench build --app jagadamba
bench --site staging.example.com migrate
bench --site staging.example.com clear-cache
bench restart
```

Reload Desk with a hard refresh. Check each department's normal user, a user with no Jagadamba role, Management, System Manager and Administrator. Include users restricted to one Company, one Project, one business unit and individual owner-only records. Compare each visible count against its filtered List view. Verify inaccessible companies and direct API calls are denied, not just hidden in the sidebar.

Check date boundaries (especially the last day), future/undated Work Orders, multi-currency orders, draft/cancelled records, custom field permlevels, users without Company access and the absence of HRMS. Exercise project creation twice from the same submitted Sales Order and test a user without Project create or Sales Order write permission. Confirm BOM, procurement, approval, invoicing and existing client scripts still perform as expected.

Do not run a broad `bench update` just for this change. To roll back, revert this change in Git, build and migrate the previous app version, clear cache and restart. Restore the pre-upgrade backup if you also need the exact previous Workspace/Custom HTML Block database state; migrations and fixture changes are not undone merely by checking out code.
