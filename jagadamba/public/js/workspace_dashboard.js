/* global frappe, __ */
(() => {
    "use strict";
    frappe.provide("jagadamba.workspace");
    const TITLES = {
        overview: ["Your operations, at a glance", "Jagadamba · Operations hub"],
        sales: ["Turn enquiries into orders", "Sales · Commercial overview"],
        production: ["Keep production moving", "Manufacturing · Production overview"],
        projects: ["Every project in focus", "Projects · Delivery overview"],
        procurement: ["Plan. Purchase. Deliver.", "Procurement · Supply overview"],
        stores: ["Keep materials flowing", "Stores · Inventory operations"],
        design: ["From drawing to production", "Engineering · Design overview"],
        accounting: ["A clear view of invoicing", "Finance · Invoice activity"],
        hr: ["People at the centre", "People · HR overview"],
    };
    const el = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const number = value => Number(value || 0).toLocaleString();
    const option = (value, label) => new Option(__(label), value);

    jagadamba.workspace.mount = function (root, scope) {
        if (root.__jagadambaDashboard) return;
        root.__jagadambaDashboard = true;
        const host = root.querySelector(".jg-dashboard");
        if (!host) return;
        const [title, eyebrow] = TITLES[scope] || TITLES.overview;
        const header = el("header", "jg-hero");
        const intro = el("div");
        intro.append(el("p", "jg-eyebrow", __(eyebrow)), el("h2", "jg-title", __(title)),
            el("p", "jg-subtitle", __("Oil & Gas · Trailers · Trading")));
        const refresh = el("button", "jg-refresh", __("Refresh"));
        refresh.type = "button";
        header.append(intro, refresh);
        const toolbar = el("div", "jg-toolbar");
        const control = (label, node) => {
            const wrapper = el("label", "jg-control");
            wrapper.append(el("span", "", __(label)), node);
            toolbar.append(wrapper);
            return node;
        };
        const company = control("Company", el("select"));
        const unit = control("Business unit", el("select"));
        const period = control("Period", el("select"));
        [["this_month", "This month"], ["last_month", "Last month"], ["this_year", "This year"],
            ["custom", "Custom dates"]].forEach(([value, label]) => period.add(option(value, label)));
        const from = control("From", el("input"));
        const to = control("To", el("input"));
        from.type = to.type = "date";
        from.parentElement.hidden = to.parentElement.hidden = true;
        if (scope === "hr") unit.parentElement.hidden = true;
        const status = el("p", "jg-status");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        const content = el("div", "jg-content");
        const footnote = el("p", "jg-footnote");
        host.replaceChildren(header, toolbar, status, content, footnote);
        let requestId = 0;
        const populate = (select, rows, selected, emptyLabel) => {
            select.replaceChildren();
            if (emptyLabel) select.add(option("", emptyLabel));
            rows.forEach(row => select.add(option(row.name || row, row.name || row)));
            select.value = selected || "";
        };
        const openList = (section, extra = []) => {
            const filters = section.filters.map(row => row.slice(1));
            extra.forEach(([field, operator, value]) => {
                for (let i = filters.length - 1; i >= 0; i--) {
                    if (filters[i][0] === field) filters.splice(i, 1);
                }
                filters.push([field, operator, value]);
            });
            const routeOptions = {};
            const lower = filters.find(row => row[0] === section.date_field && row[1] === ">=");
            const upper = filters.find(row => row[0] === section.date_field && row[1] === "<");
            filters.forEach(([field, operator, value]) => {
                if (field !== section.date_field) routeOptions[field] = operator === "=" ? value : [operator, value];
            });
            if (lower && upper) {
                const lastSecond = new Date(new Date(`${upper[2]}T00:00:00Z`).getTime() - 1000)
                    .toISOString().slice(0, 19).replace("T", " ");
                routeOptions[section.date_field] = ["between", [lower[2], lastSecond]];
            }
            frappe.set_route("List", section.doctype, "List", routeOptions);
        };
        const bars = (label, rows, onClick) => {
            const panel = el("section", "jg-chart");
            panel.append(el("h4", "jg-panel-title", __(label)));
            if (!rows.length) {
                panel.append(el("p", "jg-empty", __("No activity in this period.")));
                return panel;
            }
            const max = Math.max(1, ...rows.map(row => Number(row.value)));
            rows.forEach(row => {
                const bar = el(onClick ? "button" : "div", "jg-bar-row");
                if (onClick) {
                    bar.type = "button";
                    bar.addEventListener("click", () => onClick(row));
                }
                const caption = el("span", "jg-bar-caption");
                caption.append(el("span", "", __(String(row.label || "Unassigned"))), el("strong", "", number(row.value)));
                const track = el("span", "jg-bar-track");
                const fill = el("span", "jg-bar-fill");
                fill.style.width = `${Math.max(0, Number(row.value)) / max * 100}%`;
                track.append(fill);
                bar.append(caption, track);
                panel.append(bar);
            });
            return panel;
        };
        const render = data => {
            const metrics = el("div", "jg-metrics");
            data.sections.forEach(section => {
                const metric = el("button", "jg-metric");
                metric.type = "button";
                metric.append(el("span", "jg-metric-label", __(section.doctype)),
                    el("strong", "jg-metric-number", number(section.total)),
                    el("span", "jg-metric-hint", __("View records →")));
                metric.addEventListener("click", () => openList(section));
                metrics.append(metric);
            });
            content.append(metrics);
            if (!data.sections.length) content.append(el("p", "jg-empty",
                __("No accessible sections for these filters. Check your company, business unit, and document permissions.")));
            data.sections.forEach(section => {
                const card = el("section", "jg-section");
                const heading = el("div", "jg-section-heading");
                const headingText = el("div");
                headingText.append(el("h3", "", __(section.doctype)),
                    el("p", "jg-date-basis", `${__("Date basis")}: ${__(frappe.model.unscrub(section.date_field))}`));
                heading.append(headingText);
                if (section.amount !== null && section.amount !== undefined && data.currency) {
                    const value = el("div", "jg-value");
                    value.append(el("strong", "", `${data.currency} ${number(section.amount)}`),
                        el("small", "", __(section.amount_note)));
                    heading.append(value);
                }
                card.append(heading);
                const grid = el("div", "jg-chart-grid");
                if (section.status_field) grid.append(bars("Status breakdown", section.statuses, row =>
                    openList(section, [[section.status_field, row.label ? "=" : "is", row.label || "not set"]])));
                grid.append(bars("Monthly activity", section.trend));
                if (section.divisions.length) grid.append(bars("Business-unit mix", section.divisions));
                card.append(grid);
                const recent = el("div", "jg-recent");
                recent.append(el("h4", "jg-panel-title", __("Recent records")));
                section.recent.forEach(row => {
                    const link = el("a", "jg-record");
                    link.href = `/app/${frappe.router.slug(section.doctype)}/${encodeURIComponent(row.name)}`;
                    link.append(el("span", "jg-record-name", row.name),
                        el("span", "jg-record-date", String(row[section.date_field] || "").slice(0, 10)),
                        el("span", "jg-badge", __(row[section.status_field] || "")));
                    recent.append(link);
                });
                if (!section.recent.length) recent.append(el("p", "jg-empty", __("No records for these dates.")));
                card.append(recent);
                content.append(card);
            });
            footnote.textContent = __(data.note);
        };
        async function load() {
            if (period.value === "custom" && (!from.value || !to.value)) return;
            const id = ++requestId;
            content.replaceChildren();
            footnote.textContent = "";
            status.textContent = __("Loading your workspace…");
            host.setAttribute("aria-busy", "true");
            refresh.disabled = true;
            try {
                const response = await frappe.call({
                    method: "jagadamba.jagadamba.workspace_dashboard.get_dashboard",
                    args: {scope, company: company.value || null, business_unit: unit.value || null,
                        period: period.value, date_from: from.value || null, date_to: to.value || null},
                });
                if (id !== requestId || !host.isConnected) return;
                const data = response.message;
                populate(company, data.companies, data.company);
                populate(unit, data.business_units, unit.value, "All business units");
                status.textContent = `${data.start} — ${data.end} · ${__("Updated")} ${new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}`;
                render(data);
            } catch (error) {
                if (id !== requestId || !host.isConnected) return;
                status.textContent = __("Unable to load this workspace. Check your access and filters, then click Refresh.");
            } finally {
                if (id === requestId) {
                    refresh.disabled = false;
                    host.setAttribute("aria-busy", "false");
                }
            }
        }
        period.addEventListener("change", () => {
            const custom = period.value === "custom";
            from.parentElement.hidden = to.parentElement.hidden = !custom;
            if (custom && (!from.value || !to.value)) {
                ++requestId;
                content.replaceChildren();
                footnote.textContent = "";
                status.textContent = __("Choose both dates, then click Refresh.");
                refresh.disabled = false;
                host.setAttribute("aria-busy", "false");
            } else load();
        });
        [company, unit, from, to].forEach(input => input.addEventListener("change", load));
        refresh.addEventListener("click", load);
        load();
    };
})();
