/* global frappe, __ */
(() => {
    "use strict";
    frappe.provide("jagadamba.workspace");
    const SVG = "http://www.w3.org/2000/svg";
    // Categorical slots, assigned in fixed order (never cycled past the last slot).
    const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
    // Simple 24px stroke icons for snapshot cards (configurable per card in the profile).
    const ICONS = {
        users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
        projects: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
        tasks: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
        payment: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
        receivable: "M22 12h-4l-3 9L9 3l-3 9H2",
        quotation: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
        invoice: "M2 5h20v14H2zM2 10h20",
        order: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
        payable: "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4z",
        stock: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7L12 12l8.7-5M12 22V12",
        factory: "M2 20h20M4 20V8l6 4V8l6 4V4h4v16",
        people: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
        truck: "M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
        tool: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
        check: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3",
    };
    const PERIODS = [["this_month", "This month"], ["last_month", "Last month"], ["this_quarter", "This quarter"],
        ["this_year", "This year"], ["custom", "Custom"]];
    const el = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    };
    const svg = (tag, attrs = {}) => {
        const node = document.createElementNS(SVG, tag);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    };
    const button = (cls, text) => {
        const node = el("button", cls, text);
        node.type = "button";
        return node;
    };
    const number = value => Number(value || 0).toLocaleString();
    const compact = value => {
        try {
            const amount = Number(value || 0);
            return new Intl.NumberFormat(undefined, {notation: "compact",
                maximumFractionDigits: Math.abs(amount) >= 1e6 ? 2 : 1}).format(amount);
        } catch (e) {
            return number(value);
        }
    };
    const money = (currency, value) => `${currency ? currency + " " : ""}${compact(value)}`;
    const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const monthLabel = key => {
        const [year, month] = String(key).split("-").map(Number);
        if (!year || !month) return String(key);
        return new Date(year, month - 1, 1).toLocaleString(undefined, {month: "short"});
    };
    const tone = label => {
        const text = String(label || "").toLowerCase();
        if (/(overdue|reject|cancel|unpaid|stopped|lost|expired|absent|do not|on hold|pending repair)/.test(text)) return "bad";
        if (/(pending|open|progress|^to |partly|partial|sent|replied|interested|not started|scheduled|transit|half day|on leave)/.test(text)) return "warn";
        if (/(complete|paid|approved|accepted|closed|released|confirmed|received|delivered|active|present|submitted|converted|transferred|issued|ordered|billed)/.test(text)) return "good";
        if (/(draft|^lead$)/.test(text)) return "muted";
        return "info";
    };
    const delta = (current, previous) => {
        current = Number(current || 0);
        previous = Number(previous || 0);
        if (!previous) return current ? {text: __("New"), dir: "up"} : {text: "—", dir: "flat"};
        const change = Math.round((current - previous) / previous * 100);
        return {text: `${change > 0 ? "▲" : change < 0 ? "▼" : "•"} ${Math.abs(change)}%`, dir: change > 0 ? "up" : change < 0 ? "down" : "flat"};
    };
    const countUp = (node, target, format) => {
        node.dataset.value = String(target);
        const finish = () => { node.textContent = format(target); };
        if (reducedMotion() || typeof requestAnimationFrame !== "function" || !target) return finish();
        const started = performance.now();
        const step = now => {
            const progress = Math.min(1, (now - started) / 900);
            const eased = 1 - Math.pow(1 - progress, 3);
            node.textContent = format(Math.round(target * eased));
            if (progress < 1 && node.isConnected) requestAnimationFrame(step);
            else finish();
        };
        node.textContent = format(0);
        requestAnimationFrame(step);
    };
    const greeting = () => {
        const hour = new Date().getHours();
        const name = (frappe.boot && frappe.boot.user && frappe.boot.user.first_name) || "";
        const part = hour < 12 ? __("Good morning") : hour < 17 ? __("Good afternoon") : __("Good evening");
        return name ? `${part}, ${name}` : part;
    };

    jagadamba.workspace.mount = function (root, scope) {
        if (root.__jagadambaDashboard) return;
        root.__jagadambaDashboard = true;
        const host = root.querySelector(".jg-dashboard");
        if (!host) return;
        const state = {unit: "", period: "this_month"};

        // Hero
        const header = el("header", "jg-hero");
        const glow = el("div", "jg-hero-glow");
        glow.setAttribute("aria-hidden", "true");
        glow.append(el("span"), el("span"), el("span"));
        const intro = el("div", "jg-hero-text");
        const eyebrow = el("p", "jg-eyebrow", __("Jagadamba"));
        const hello = el("p", "jg-greeting", greeting());
        const title = el("h2", "jg-title", __("Loading your workspace…"));
        const subtitle = el("p", "jg-subtitle");
        intro.append(eyebrow, hello, title, subtitle);
        const side = el("div", "jg-hero-side");
        const range = el("span", "jg-range");
        const refresh = button("jg-refresh", __("Refresh"));
        refresh.setAttribute("aria-label", __("Refresh dashboard"));
        side.append(range, refresh);
        const actions = el("div", "jg-actions");
        header.append(glow, intro, side, actions);

        // Classic layout header: compact title row with period select and refresh.
        const classicHead = el("header", "jg-head");
        classicHead.hidden = true;
        const badge = el("span", "jg-badge-mark");
        badge.setAttribute("aria-hidden", "true");
        const headText = el("div", "jg-head-text");
        const headEyebrow = el("p", "jg-head-eyebrow");
        const headTitle = el("h2", "jg-head-title");
        headText.append(headEyebrow, headTitle);
        const headSide = el("div", "jg-head-side");
        const today = el("span", "jg-head-date", new Date().toLocaleDateString(undefined,
            {weekday: "short", month: "short", day: "numeric", year: "numeric"}));
        const periodSelect = el("select", "jg-head-period");
        periodSelect.setAttribute("aria-label", __("Period"));
        const headRefresh = button("jg-head-refresh", `↻ ${__("Refresh")}`);
        headSide.append(today, periodSelect, headRefresh);
        classicHead.append(badge, headText, headSide);

        // Filters
        const toolbar = el("div", "jg-toolbar");
        const companyWrap = el("label", "jg-control");
        const company = el("select");
        company.setAttribute("aria-label", __("Company"));
        companyWrap.append(el("span", "", __("Company")), company);
        const unitWrap = el("div", "jg-control");
        const units = el("div", "jg-chips");
        units.setAttribute("role", "group");
        units.setAttribute("aria-label", __("Business unit"));
        unitWrap.append(el("span", "", __("Business unit")), units);
        const periodWrap = el("div", "jg-control");
        const periods = el("div", "jg-chips");
        periods.setAttribute("role", "group");
        periods.setAttribute("aria-label", __("Period"));
        periodWrap.append(el("span", "", __("Period")), periods);
        const datesWrap = el("div", "jg-control jg-dates");
        const from = el("input");
        const to = el("input");
        from.type = to.type = "date";
        from.setAttribute("aria-label", __("From"));
        to.setAttribute("aria-label", __("To"));
        datesWrap.append(el("span", "", __("From – To")), el("div", "jg-date-pair"));
        datesWrap.lastChild.append(from, to);
        datesWrap.hidden = true;
        toolbar.append(companyWrap, unitWrap, periodWrap, datesWrap);
        if (scope === "hr") unitWrap.hidden = true;

        const status = el("p", "jg-status");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        const content = el("div", "jg-content");
        const footnote = el("p", "jg-footnote");
        const tooltip = el("div", "jg-tooltip");
        tooltip.setAttribute("role", "tooltip");
        tooltip.hidden = true;
        host.replaceChildren(classicHead, header, toolbar, status, content, footnote, tooltip);
        let requestId = 0;

        const chip = (group, value, label, onPick) => {
            const node = button("jg-chip", __(label));
            node.dataset.value = value;
            node.addEventListener("click", () => onPick(value));
            group.append(node);
            return node;
        };
        const markChips = (group, value) => group.querySelectorAll(".jg-chip").forEach(node => {
            node.setAttribute("aria-pressed", String(node.dataset.value === value));
        });
        PERIODS.forEach(([value, label]) => {
            chip(periods, value, label, pickPeriod);
            periodSelect.add(new Option(__(label), value));
        });
        periodSelect.addEventListener("change", () => pickPeriod(periodSelect.value));
        headRefresh.addEventListener("click", () => load());
        markChips(periods, state.period);

        const showTip = (event, lines) => {
            tooltip.replaceChildren(...lines.map((line, index) => el(index ? "span" : "strong", "", line)));
            tooltip.hidden = false;
            const box = host.getBoundingClientRect();
            const x = (event.clientX || 0) - box.left + 14;
            const y = (event.clientY || 0) - box.top + 14;
            tooltip.style.left = `${Math.min(x, Math.max(0, box.width - 200))}px`;
            tooltip.style.top = `${y}px`;
        };
        const hideTip = () => { tooltip.hidden = true; };
        const hover = (node, lines) => {
            node.addEventListener("mousemove", event => showTip(event, lines));
            node.addEventListener("mouseleave", hideTip);
            node.addEventListener("focus", event => showTip(event, lines));
            node.addEventListener("blur", hideTip);
        };

        const openList = (section, extra = [], base = section.filters) => {
            const filters = base.map(row => row.slice(1));
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
                if (field === section.date_field && (operator === ">=" || operator === "<") && lower && upper) return;
                routeOptions[field] = operator === "=" ? value : [operator, value];
            });
            if (lower && upper) {
                const lastSecond = new Date(new Date(`${upper[2]}T00:00:00Z`).getTime() - 1000)
                    .toISOString().slice(0, 19).replace("T", " ");
                routeOptions[section.date_field] = ["between", [lower[2], lastSecond]];
            }
            frappe.set_route("List", section.doctype, "List", routeOptions);
        };
        const drill = (section, field, label) => openList(section, [[field, label ? "=" : "is", label || "not set"]]);

        const sparkline = (rows, color) => {
            const values = rows.map(row => Number(row.amount || row.value || 0));
            const chart = svg("svg", {viewBox: "0 0 100 28", preserveAspectRatio: "none", class: "jg-spark", "aria-hidden": "true"});
            if (values.length < 2) return chart;
            const max = Math.max(1, ...values);
            const points = values.map((value, index) => `${(index / (values.length - 1) * 100).toFixed(1)},${(26 - value / max * 24).toFixed(1)}`);
            chart.append(svg("polyline", {points: `0,28 ${points.join(" ")} 100,28`, fill: color, "fill-opacity": "0.12", stroke: "none"}),
                svg("polyline", {points: points.join(" "), fill: "none", stroke: color, "stroke-width": "2",
                    "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-linecap": "round", class: "jg-spark-line"}));
            return chart;
        };

        const metric = (section, data, index) => {
            const card = el("article", "jg-metric");
            card.style.setProperty("--jg-tone", section.color || PALETTE[index % PALETTE.length]);
            card.style.animationDelay = `${index * 60}ms`;
            const main = button("jg-metric-main");
            const top = el("span", "jg-metric-top");
            const change = delta(section.total, section.previous_total);
            const chipNode = el("span", `jg-delta jg-delta-${change.dir}`, change.text);
            chipNode.title = __("Compared with {0} – {1}", [data.previous_start, data.previous_end]);
            top.append(el("span", "jg-dot"), el("span", "jg-metric-label", __(section.label)), chipNode);
            const count = el("strong", "jg-metric-number");
            countUp(count, Number(section.total || 0), number);
            main.append(top, count);
            if (section.amount !== null && section.amount !== undefined) {
                const amount = el("span", "jg-metric-amount");
                amount.append(el("b", "", money(data.currency, section.amount)), el("span", "", ` ${__(section.amount_label)}`));
                amount.title = `${data.currency || ""} ${number(section.amount)}`;
                main.append(amount);
            } else {
                main.append(el("span", "jg-metric-amount", __("records in period")));
            }
            main.append(sparkline(section.trend, card.style.getPropertyValue("--jg-tone")));
            main.addEventListener("click", () => openList(section));
            main.setAttribute("aria-label", `${__(section.label)}: ${number(section.total)}. ${__("Open list")}`);
            card.append(main);
            if (section.alert) {
                const alert = button(`jg-alert ${section.alert.count ? "is-hot" : "is-calm"}`);
                alert.append(el("b", "", number(section.alert.count)), el("span", "", ` ${__(section.alert.label)}`),
                    el("span", "jg-arrow", "→"));
                alert.addEventListener("click", () => openList(section, [], section.alert.filters));
                card.append(alert);
            }
            return card;
        };

        const panel = (label, extraClass) => {
            const node = el("section", `jg-panel ${extraClass || ""}`.trim());
            node.append(el("h4", "jg-panel-title", __(label)));
            return node;
        };
        const empty = text => el("p", "jg-empty", __(text));

        const donut = (section) => {
            const node = panel("Status", "jg-panel-donut");
            const rows = section.statuses.filter(row => Number(row.value) > 0);
            if (!rows.length) return node.append(empty("No activity in this period.")), node;
            const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
            const wrap = el("div", "jg-donut-wrap");
            const chart = svg("svg", {viewBox: "0 0 120 120", class: "jg-donut", role: "img",
                "aria-label": __("Status breakdown")});
            const radius = 46, circumference = 2 * Math.PI * radius, gap = rows.length > 1 ? 2 : 0;
            chart.append(svg("circle", {cx: 60, cy: 60, r: radius, class: "jg-donut-track"}));
            let offset = 0;
            const legend = el("div", "jg-legend");
            rows.slice(0, PALETTE.length).forEach((row, index) => {
                const length = Number(row.value) / total * circumference;
                const color = PALETTE[index];
                const arc = svg("circle", {cx: 60, cy: 60, r: radius, class: "jg-donut-seg", stroke: color,
                    "stroke-dashoffset": String(-offset), transform: "rotate(-90 60 60)", tabindex: "0"});
                arc.style.strokeDasharray = `${Math.max(0, length - gap)} ${circumference}`;
                arc.style.animationDelay = `${index * 80}ms`;
                const label = String(row.label || __("Not set"));
                const share = Math.round(Number(row.value) / total * 100);
                hover(arc, [__(label), `${number(row.value)} · ${share}%`]);
                arc.addEventListener("click", () => drill(section, section.status_field, row.label));
                chart.append(arc);
                offset += length;
                const item = button("jg-legend-item");
                const swatch = el("span", "jg-swatch");
                swatch.style.background = color;
                item.append(swatch, el("span", "jg-legend-label", __(label)), el("b", "", number(row.value)));
                item.addEventListener("click", () => drill(section, section.status_field, row.label));
                legend.append(item);
            });
            const centre = svg("text", {x: 60, y: 58, "text-anchor": "middle", class: "jg-donut-total"});
            centre.textContent = compact(total);
            const caption = svg("text", {x: 60, y: 74, "text-anchor": "middle", class: "jg-donut-caption"});
            caption.textContent = __("total");
            chart.append(centre, caption);
            wrap.append(chart, legend);
            node.append(wrap);
            return node;
        };

        const columns = (section, data) => {
            const useAmount = section.amount !== null && section.amount !== undefined;
            const node = panel(useAmount ? `Monthly ${String(section.amount_label || "value").toLowerCase()}` : "Monthly activity", "jg-panel-trend");
            const rows = section.trend;
            if (!rows.some(row => Number(useAmount ? row.amount : row.value))) return node.append(empty("No activity in this period.")), node;
            const width = 320, height = 150, base = 128, pad = 6;
            const chart = svg("svg", {viewBox: `0 0 ${width} ${height}`, class: "jg-columns", role: "img",
                "aria-label": __("Monthly trend")});
            const values = rows.map(row => Number((useAmount ? row.amount : row.value) || 0));
            const max = Math.max(1, ...values);
            [0.5, 1].forEach(fraction => chart.append(svg("line", {x1: 0, x2: width, y1: base - (base - 18) * fraction,
                y2: base - (base - 18) * fraction, class: "jg-grid"})));
            chart.append(svg("line", {x1: 0, x2: width, y1: base, y2: base, class: "jg-axis"}));
            const slot = width / rows.length;
            const barWidth = Math.max(6, Math.min(34, slot - 10));
            rows.forEach((row, index) => {
                const value = values[index];
                const barHeight = Math.max(value ? 3 : 0, value / max * (base - 18));
                const x = index * slot + (slot - barWidth) / 2;
                const hit = svg("rect", {x: index * slot, y: 0, width: slot, height: base, class: "jg-hit", tabindex: "0"});
                const bar = svg("path", {class: "jg-col", d: roundedTop(x, base - barHeight, barWidth, barHeight, Math.min(4, barWidth / 2))});
                bar.style.animationDelay = `${index * 40}ms`;
                const lines = [`${monthLabel(row.label)} ${String(row.label).slice(0, 4)}`, `${number(row.value)} ${__("records")}`];
                if (useAmount) lines.push(`${data.currency || ""} ${number(row.amount)}`);
                hover(hit, lines);
                chart.append(bar, hit);
                if (rows.length <= 7 || index === rows.length - 1 || index === 0) {
                    const text = svg("text", {x: index * slot + slot / 2, y: base + 16, "text-anchor": "middle", class: "jg-tick"});
                    text.textContent = monthLabel(row.label);
                    chart.append(text);
                }
                if (value === max) {
                    const peak = svg("text", {x: index * slot + slot / 2, y: Math.max(10, base - barHeight - pad), "text-anchor": "middle", class: "jg-peak"});
                    peak.textContent = compact(value);
                    chart.append(peak);
                }
            });
            node.append(chart);
            return node;
        };
        function roundedTop(x, y, w, h, r) {
            if (h <= 0) return "";
            r = Math.min(r, h);
            return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
        }

        const ranking = (label, section, rows, field, data) => {
            const node = panel(label, "jg-panel-rank");
            if (!rows.length) return node.append(empty("No activity in this period.")), node;
            const useAmount = rows.some(row => row.amount !== undefined && row.amount !== null);
            const max = Math.max(1, ...rows.map(row => Number(useAmount ? row.amount : row.value) || 0));
            rows.forEach((row, index) => {
                const item = button("jg-rank-row");
                item.style.animationDelay = `${index * 50}ms`;
                const caption = el("span", "jg-rank-caption");
                const shown = useAmount ? money(data.currency, row.amount) : number(row.value);
                caption.append(el("span", "jg-rank-name", __(String(row.label || "Not set"))), el("strong", "", shown));
                const track = el("span", "jg-track");
                const fill = el("span", "jg-fill");
                fill.style.width = `${Math.max(2, Number(useAmount ? row.amount : row.value) / max * 100)}%`;
                track.append(fill);
                item.append(caption, track);
                item.title = useAmount ? `${number(row.value)} ${__("records")} · ${data.currency || ""} ${number(row.amount)}`
                    : `${number(row.value)} ${__("records")}`;
                if (field) item.addEventListener("click", () => drill(section, field, row.label));
                node.append(item);
            });
            return node;
        };

        const recentList = (section, data) => {
            const node = panel("Recent records", "jg-panel-recent");
            if (!section.recent.length) return node.append(empty("No records for these dates.")), node;
            section.recent.forEach((row, index) => {
                const link = el("a", "jg-record");
                link.style.animationDelay = `${index * 40}ms`;
                link.href = `/app/${frappe.router.slug(section.doctype)}/${encodeURIComponent(row.name)}`;
                const left = el("span", "jg-record-main");
                left.append(el("span", "jg-record-name", row.name));
                if (section.party_field && row[section.party_field]) left.append(el("span", "jg-record-party", String(row[section.party_field])));
                link.append(left, el("span", "jg-record-date", String(row[section.date_field] || "").slice(0, 10)));
                if (section.amount_field && row[section.amount_field] !== undefined) {
                    link.append(el("span", "jg-record-amount", money(data.currency, row[section.amount_field])));
                }
                if (section.status_field) {
                    const value = row[section.status_field];
                    link.append(el("span", `jg-badge jg-tone-${tone(value)}`, __(value || "—")));
                }
                node.append(link);
            });
            return node;
        };

        const sectionCard = (section, data, index) => {
            const card = el("section", "jg-section");
            card.style.setProperty("--jg-tone", section.color || PALETTE[index % PALETTE.length]);
            card.style.animationDelay = `${120 + index * 70}ms`;
            const heading = el("div", "jg-section-heading");
            const headingText = el("div");
            headingText.append(el("h3", "", __(section.label)),
                el("p", "jg-date-basis", `${__(section.doctype)} · ${__("Date basis")}: ${section.date_label || __(frappe.model.unscrub(section.date_field))}`));
            heading.append(headingText);
            const values = el("div", "jg-values");
            if (section.amount !== null && section.amount !== undefined && data.currency) {
                const value = el("div", "jg-value");
                value.append(el("small", "", __(section.amount_label)), el("strong", "", `${data.currency} ${number(section.amount)}`));
                values.append(value);
            }
            if (section.secondary_amount !== null && section.secondary_amount !== undefined && data.currency) {
                const value = el("div", "jg-value");
                value.append(el("small", "", __(section.secondary_amount_label)), el("strong", "", `${data.currency} ${number(section.secondary_amount)}`));
                values.append(value);
            }
            const open = button("jg-open", __("Open list →"));
            open.addEventListener("click", () => openList(section));
            values.append(open);
            heading.append(values);
            card.append(heading);
            const grid = el("div", "jg-panel-grid");
            if (section.status_field) grid.append(donut(section));
            grid.append(columns(section, data));
            if (section.party_field) grid.append(ranking(`${__("Top")} ${section.party_label || frappe.model.unscrub(section.party_field)}`, section, section.top, section.party_field, data));
            if (section.divisions.length) grid.append(ranking("Business-unit mix", section, section.divisions, null, data));
            card.append(grid, recentList(section, data));
            return card;
        };

        const heading = (label, extra) => {
            const node = el("div", "jg-heading");
            node.append(el("h3", "", __(label)), el("span", "jg-heading-rule"));
            if (extra) node.append(extra);
            return node;
        };
        const icon = name => {
            const chart = svg("svg", {viewBox: "0 0 24 24", class: "jg-icon", "aria-hidden": "true"});
            chart.append(svg("path", {d: ICONS[name] || ICONS.check}));
            return chart;
        };
        const openFilters = (doctype, filters, dateField) => openList({doctype, date_field: dateField, filters}, [], filters);

        const snapshot = (kpis, data) => {
            const grid = el("div", "jg-snapshot");
            kpis.forEach((row, index) => {
                const card = button("jg-kpi");
                card.style.setProperty("--jg-tone", row.color || PALETTE[index % PALETTE.length]);
                card.style.animationDelay = `${index * 55}ms`;
                const label = el("span", "jg-kpi-label");
                label.append(icon(row.icon), el("span", "", __(row.label)));
                const value = el("strong", "jg-kpi-value");
                countUp(value, Number(row.value || 0), row.aggregate === "Sum" ? compact : number);
                if (row.aggregate === "Sum") value.title = `${data.currency || ""} ${number(row.value)}`;
                card.append(label, value, el("span", "jg-kpi-caption", row.caption || ""));
                card.setAttribute("aria-label", `${__(row.label)}: ${row.aggregate === "Sum" ? compact(row.value) : number(row.value)}. ${row.caption || ""}`);
                card.addEventListener("click", () => openFilters(row.doctype, row.filters, row.date_field));
                grid.append(card);
            });
            return grid;
        };

        const niceStep = max => {
            const raw = max / 7;
            const power = Math.pow(10, Math.floor(Math.log10(raw || 1)));
            const unit = raw / power;
            return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
        };

        const comparisonChart = (chart, data) => {
            const width = 1000, height = 380, left = 64, right = 12, top = 16, bottom = 40;
            const plotH = height - top - bottom, plotW = width - left - right;
            const count = chart.labels.length;
            const max = Math.max(1, ...chart.series.flatMap(series => series.values.map(Number)));
            const step = niceStep(max);
            const ceiling = Math.ceil(max / step) * step;
            const node = svg("svg", {viewBox: `0 0 ${width} ${height}`, class: "jg-compare-svg", role: "img",
                "aria-label": chart.series.map(series => `${series.label} ${compact(series.total)}`).join(", ")});
            for (let tick = 0; tick <= ceiling + 1e-9; tick += step) {
                const y = top + plotH - tick / ceiling * plotH;
                node.append(svg("line", {x1: left, x2: width - right, y1: y, y2: y, class: tick ? "jg-grid" : "jg-axis"}));
                const text = svg("text", {x: left - 10, y: y + 4, "text-anchor": "end", class: "jg-tick"});
                text.textContent = compact(tick);
                node.append(text);
            }
            node.append(svg("line", {x1: left, x2: left, y1: top, y2: top + plotH, class: "jg-axis"}));
            const slot = plotW / count;
            const groups = chart.series.length;
            const barW = Math.max(4, Math.min(58, (slot - 18) / groups - 6));
            chart.labels.forEach((label, index) => {
                const groupW = groups * barW + (groups - 1) * 8;
                let x = left + index * slot + (slot - groupW) / 2;
                chart.series.forEach((series, seriesIndex) => {
                    const value = Number(series.values[index] || 0);
                    const barH = value ? Math.max(2, value / ceiling * plotH) : 0;
                    const bar = svg("path", {class: "jg-cbar", fill: series.color || PALETTE[seriesIndex],
                        d: roundedTop(x, top + plotH - barH, barW, barH, Math.min(4, barW / 2))});
                    bar.style.animationDelay = `${index * 45 + seriesIndex * 20}ms`;
                    node.append(bar);
                    x += barW + 8;
                });
                const tick = svg("text", {x: left + index * slot + slot / 2, y: height - 14, "text-anchor": "middle", class: "jg-tick jg-month"});
                tick.textContent = monthLabel(label);
                node.append(tick);
                const hit = svg("rect", {x: left + index * slot, y: top, width: slot, height: plotH, class: "jg-hit", tabindex: "0"});
                const lines = [`${monthLabel(label)} ${String(label).slice(0, 4)}`,
                    ...chart.series.map(series => `${__(series.label)}: ${compact(series.values[index])}`)];
                if (chart.difference && groups >= 2) {
                    const first = Number(chart.series[0].values[index] || 0);
                    const diff = first - Number(chart.series[1].values[index] || 0);
                    lines.push(`${__(chart.difference.label)}: ${compact(diff)}${first ? ` (${Math.round(diff / first * 100)}%)` : ""}`);
                }
                hover(hit, lines);
                hit.addEventListener("click", () => {
                    const series = chart.series[0];
                    const [year, month] = String(label).split("-").map(Number);
                    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
                    openList({doctype: series.doctype, date_field: series.date_field, filters: series.filters},
                        [[series.date_field, "between", [`${label}-01`, last]]]);
                });
                node.append(hit);
            });
            return node;
        };

        const comparisonPanel = (initial, data) => {
            const panel = el("section", "jg-compare");
            const bar = el("div", "jg-compare-bar");
            const legend = el("div", "jg-compare-legend");
            initial.series.forEach((series, index) => {
                const item = el("span", "jg-compare-key");
                const swatch = el("span", "jg-swatch");
                swatch.style.background = series.color || PALETTE[index];
                item.append(swatch, el("span", "", __(series.label)));
                legend.append(item);
            });
            const range = el("div", "jg-compare-range");
            const start = el("input");
            const finish = el("input");
            start.type = finish.type = "date";
            start.setAttribute("aria-label", __("Chart from"));
            finish.setAttribute("aria-label", __("Chart to"));
            const apply = button("jg-compare-apply", __("Apply"));
            const reset = button("jg-compare-reset", "↺");
            reset.setAttribute("aria-label", __("Reset chart dates"));
            range.append(start, el("span", "jg-compare-arrow", "→"), finish, apply, reset);
            const totals = el("div", "jg-compare-totals");
            bar.append(legend, range, totals);
            const plot = el("div", "jg-compare-plot");
            const note = el("p", "jg-compare-note");
            panel.append(bar, plot, note);
            const draw = chart => {
                totals.replaceChildren();
                chart.series.forEach((series, index) => {
                    const total = el("div", "jg-compare-total");
                    const value = el("strong", "", compact(series.total));
                    value.style.color = series.color || PALETTE[index];
                    value.title = `${data.currency || ""} ${number(series.total)}`;
                    total.append(el("small", "", `${__("Total")} ${__(series.label)}`), value);
                    totals.append(total);
                });
                if (chart.difference) {
                    const total = el("div", "jg-compare-total jg-compare-diff");
                    const value = el("strong", "", compact(chart.difference.total));
                    value.title = `${data.currency || ""} ${number(chart.difference.total)}`;
                    total.append(el("small", "", __(chart.difference.label)), value);
                    totals.append(total);
                }
                plot.replaceChildren(comparisonChart(chart, data));
                note.textContent = `${chart.start} → ${chart.end}`;
            };
            let chartRequest = 0;
            apply.addEventListener("click", async () => {
                if (!start.value || !finish.value) {
                    note.textContent = __("Choose both chart dates, then click Apply.");
                    return;
                }
                const id = ++chartRequest;
                note.textContent = __("Loading…");
                try {
                    const response = await frappe.call({
                        method: "jagadamba.jagadamba.workspace_dashboard.get_comparison",
                        args: {scope, company: company.value || null, business_unit: state.unit || null,
                            date_from: start.value, date_to: finish.value},
                    });
                    if (id !== chartRequest || !panel.isConnected) return;
                    if (response.message) draw(response.message);
                    else note.textContent = __("No readable data for these dates.");
                } catch (error) {
                    if (id === chartRequest) note.textContent = __("Unable to load the chart. Use a range of at most one year.");
                }
            });
            reset.addEventListener("click", () => {
                ++chartRequest;
                start.value = finish.value = "";
                draw(initial);
            });
            draw(initial);
            return panel;
        };

        const renderActions = data => {
            actions.replaceChildren();
            const seen = new Set();
            data.sections.forEach(section => {
                if (seen.has(section.doctype)) return;
                seen.add(section.doctype);
                if (!(frappe.model.can_create && frappe.model.can_create(section.doctype))) return;
                const action = button("jg-action", `+ ${__(section.doctype)}`);
                action.addEventListener("click", () => frappe.new_doc(section.doctype));
                actions.append(action);
            });
        };

        const render = data => {
            const classic = data.layout === "Classic";
            host.classList.toggle("jg-classic", classic);
            classicHead.hidden = !classic;
            header.hidden = classic;
            periods.parentElement.hidden = classic;
            if (classic) {
                const name = String(data.company || "Jagadamba");
                badge.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
                headEyebrow.textContent = name;
                headTitle.textContent = __(data.title || "Overview");
                periodSelect.value = state.period;
            }
            if (data.accent) host.style.setProperty("--jg-accent", data.accent);
            eyebrow.textContent = __(data.eyebrow || "Jagadamba");
            title.textContent = __(data.title || "Workspace");
            subtitle.textContent = __(data.subtitle || "");
            range.textContent = `${data.start} → ${data.end}`;
            renderActions(data);
            if (data.kpis && data.kpis.length) content.append(heading("Snapshot"), snapshot(data.kpis, data));
            if (data.comparison && data.comparison.series.length) {
                content.append(heading(data.comparison.title), comparisonPanel(data.comparison, data));
            }
            if ((data.kpis && data.kpis.length) || data.comparison) content.append(heading("Details"));
            const metrics = el("div", "jg-metrics");
            data.sections.forEach((section, index) => metrics.append(metric(section, data, index)));
            content.append(metrics);
            if (!data.sections.length) content.append(empty(
                "No accessible sections for these filters. Check your company, business unit, and document permissions."));
            const sections = el("div", "jg-sections");
            data.sections.forEach((section, index) => sections.append(sectionCard(section, data, index)));
            content.append(sections);
            footnote.textContent = __(data.note);
        };

        const skeleton = () => {
            const metrics = el("div", "jg-metrics jg-skeleton");
            for (let i = 0; i < 4; i++) metrics.append(el("div", "jg-skel-card"));
            const block = el("div", "jg-skel-block");
            content.replaceChildren(metrics, block);
        };

        const populateCompany = (rows, selected) => {
            company.replaceChildren();
            rows.forEach(row => company.add(new Option(row.name, row.name)));
            company.value = selected || "";
        };
        const populateUnits = values => {
            if (state.unit && !values.includes(state.unit)) state.unit = "";
            units.replaceChildren();
            chip(units, "", "All", pickUnit);
            values.forEach(value => chip(units, value, value, pickUnit));
            markChips(units, state.unit);
        };

        async function load() {
            if (state.period === "custom" && (!from.value || !to.value)) return;
            const id = ++requestId;
            hideTip();
            skeleton();
            footnote.textContent = "";
            status.textContent = __("Loading your workspace…");
            host.setAttribute("aria-busy", "true");
            refresh.disabled = true;
            try {
                const response = await frappe.call({
                    method: "jagadamba.jagadamba.workspace_dashboard.get_dashboard",
                    args: {scope, company: company.value || null, business_unit: state.unit || null,
                        period: state.period, date_from: from.value || null, date_to: to.value || null},
                });
                if (id !== requestId || !host.isConnected) return;
                const data = response.message;
                populateCompany(data.companies, data.company);
                populateUnits(data.business_units || []);
                content.replaceChildren();
                status.textContent = `${__("Updated")} ${new Date().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}`;
                render(data);
            } catch (error) {
                if (id !== requestId || !host.isConnected) return;
                content.replaceChildren();
                status.textContent = __("Unable to load this workspace. Check your access and filters, then click Refresh.");
            } finally {
                if (id === requestId) {
                    refresh.disabled = false;
                    host.setAttribute("aria-busy", "false");
                }
            }
        }
        function pickUnit(value) {
            state.unit = value;
            markChips(units, value);
            load();
        }
        function pickPeriod(value) {
            state.period = value;
            markChips(periods, value);
            periodSelect.value = value;
            const custom = value === "custom";
            datesWrap.hidden = !custom;
            if (custom && (!from.value || !to.value)) {
                ++requestId;
                content.replaceChildren();
                footnote.textContent = "";
                status.textContent = __("Choose both dates, then click Refresh.");
                refresh.disabled = false;
                host.setAttribute("aria-busy", "false");
            } else load();
        }
        [company, from, to].forEach(input => input.addEventListener("change", load));
        refresh.addEventListener("click", load);
        load();
    };
})();
