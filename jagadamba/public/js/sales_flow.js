/* global frappe, flt, precision, format_currency, format_number, __ */
(() => {
	"use strict";
	frappe.provide("jagadamba.sales_flow");
	const states = new WeakMap();
	const empty = value => value === undefined || value === null || value === "";

	// Each document owns its pending requests; nothing is cached across documents/users.
	jagadamba.sales_flow.copy_from_source = function (frm, options) {
		const doc = frm.doc;
		let state = states.get(doc);
		if (!state) {
			state = { versions: new Map(), pending: new Map(), latest: new Map() };
			states.set(doc, state);
		}
		const { doctype, link_field, fields, overwrite = false, only_new = false } = options;
		const source = doc[link_field];
		const guard = options.guard || (() => true);
		const key = JSON.stringify([doctype, link_field, source, fields, overwrite]);
		const latest = state.latest.get(link_field);
		if (!overwrite && latest?.overwrite && latest.source === source && latest.doctype === doctype
			&& state.pending.get(latest.key) === latest.entry) return latest.entry.promise;
		const previous = state.pending.get(key);
		if (previous && previous.version === state.versions.get(link_field)) return previous.promise;
		const version = (state.versions.get(link_field) || 0) + 1;
		state.versions.set(link_field, version);
		if (!source || doc.docstatus !== 0 || (only_new && !frm.is_new()) || !guard()) return Promise.resolve();
		if (!overwrite && Object.keys(fields).every(field => !empty(doc[field]))) return Promise.resolve();
		const snapshot = Object.fromEntries(Object.keys(fields).map(field => [field, doc[field]]));
		const still_current = () => frm.doc === doc && doc.docstatus === 0 && doc[link_field] === source
			&& state.versions.get(link_field) === version && (!only_new || frm.is_new()) && guard();
		const entry = { version };
		entry.promise = (async () => {
			const response = await frappe.db.get_value(doctype, source, [...new Set(Object.values(fields))]);
			const data = response && response.message;
			if (!data || !still_current()) return;
			// An explicit type change while fetching invalidates its dependent item values too.
			if (fields.custom_types && doc.custom_types !== snapshot.custom_types) return;
			const source_type = fields.custom_types && data[fields.custom_types];
			if (!overwrite && doc.custom_types && source_type && doc.custom_types !== source_type) return;
			const values = {};
			for (const [target, source_field] of Object.entries(fields)) {
				if (!Object.prototype.hasOwnProperty.call(data, source_field)) continue;
				if (doc[target] !== snapshot[target] || (!overwrite && !empty(doc[target]))) continue;
				if (!overwrite && empty(data[source_field])) continue;
				const value = data[source_field] == null ? "" : data[source_field];
				if (doc[target] !== value) values[target] = value;
			}
			if (!Object.keys(values).length) return;
			// Let mapped Type + Item arrive together; manual Type changes still clear items.
			const previous_type = frm.__jagadamba_mapped_type;
			if (Object.prototype.hasOwnProperty.call(values, "custom_types")) {
				frm.__jagadamba_mapped_type = values.custom_types;
			}
			try {
				await frm.set_value(values);
			} finally {
				frm.__jagadamba_mapped_type = previous_type;
			}
		})();
		state.pending.set(key, entry);
		state.latest.set(link_field, { key, source, doctype, overwrite, entry });
		return entry.promise.finally(() => {
			if (state.pending.get(key) === entry) state.pending.delete(key);
		});
	};

	jagadamba.sales_flow.clear_type_items = function (frm, fields) {
		if (frm.__jagadamba_mapped_type === frm.doc.custom_types) return Promise.resolve();
		return frm.set_value(Object.fromEntries(fields.map(field => [field, ""])));
	};

	const configurations = new WeakMap();
	jagadamba.sales_flow.configure = function (frm, force = false) {
		const doc = frm.doc;
		const type = doc.custom_types;
		const previous = configurations.get(doc);
		if (previous?.type === type && (!force || previous.pending)) return previous.promise;
		const entry = {type, pending: true};
		configurations.set(doc, entry);
		entry.promise = (async () => {
			const response = await frappe.call({
				method: "jagadamba.jagadamba.type_settings.get_type_settings",
				args: {type_name: type || null},
			});
			if (frm.doc !== doc || doc.custom_types !== type || configurations.get(doc) !== entry) return;
			for (const [key, value] of Object.entries(response.message || {})) doc["custom_" + key] = value;
			// Refresh dependency expressions without dirtying a saved document.
			frm.refresh_fields();
			if (doc.doctype === "Quotation" && frm.is_new() && doc.custom_enable_estimation && !doc.custom_estimation_cost_source) {
				await frm.set_value("custom_estimation_cost_source", "Estimation");
			}
		})().catch(error => {
			if (configurations.get(doc) === entry) configurations.delete(doc);
			throw error;
		}).finally(() => { entry.pending = false; });
		return entry.promise;
	};

	jagadamba.sales_flow.item_filters = function (frm, finished = false) {
		const filters = {disabled: 0};
		if (frm.doc.custom_types) filters.custom_types = frm.doc.custom_types;
		if (frm.doc.company) filters.custom_company = frm.doc.company;
		if (finished && frm.doc.custom_finished_item_group) filters.item_group = frm.doc.custom_finished_item_group;
		return filters;
	};

	jagadamba.sales_flow.recalculate = function (frm) {
		const doc = frm.doc;
		if (doc.docstatus !== 0 || !doc.custom_enable_estimation) return Promise.resolve();
		const rounded = (value, field, row = doc) => flt(value, precision(field, row));
		const rows = doc.custom_estimation_items || [];
		let total = flt(doc.custom_total_estimated_value);
		if (doc.doctype === "Quotation") {
			total = 0;
			for (const row of rows) {
				row.amount = rounded(flt(row.qty) * flt(row.rate), "amount", row);
				total += row.amount;
			}
			frm.refresh_field("custom_estimation_items");
		}
		const basis = doc.custom_estimation_cost_source || (rows.length || (doc.doctype === "Quotation" && frm.is_new()) ? "Estimation" : "Document Net Total");
		const cost = rounded(basis === "Estimation" ? total : flt(doc.net_total), "custom_total_estimated_value");
		const sale = flt(doc.custom_sale_value_without_tax);
		const vat = rounded(sale * flt(doc.custom_vat_percent) / 100, "custom_vat_amount");
		const tax_basis = doc.custom_tax_basis || "Sale Value + VAT";
		const tax_base = tax_basis === "Sale Value + VAT" ? sale + vat : sale;
		const tax = rounded(tax_base * flt(doc.custom_tax_percent) / 100, "custom_tax_amount");
		const values = {
			custom_estimation_cost_source: basis,
			custom_tax_basis: tax_basis,
			custom_total_estimated_value: cost,
			custom_vat_amount: vat,
			custom_tax_amount: tax,
			custom_total_quoted_value: rounded(sale + vat + tax, "custom_total_quoted_value"),
			custom_net_profit: rounded(sale - cost, "custom_net_profit"),
		};
		const changes = Object.fromEntries(Object.entries(values).filter(([field, value]) =>
			typeof value === "number" ? flt(doc[field]) !== value : doc[field] !== value));
		const write = Object.keys(changes).length ? frm.set_value(changes) : Promise.resolve();
		return write.then(() => jagadamba.sales_flow.render_statement(frm));
	};

	// Read-only preview of the estimation sheet in the estimation department's layout.
	jagadamba.sales_flow.render_statement = function (frm) {
		const field = frm.get_field && frm.get_field("custom_estimation_statement");
		if (!field || !field.$wrapper) return;
		const doc = frm.doc;
		const esc = value => frappe.utils.escape_html(value == null ? "" : String(value));
		const money = value => format_currency(flt(value), doc.currency);
		const num = value => format_number(flt(value), null, precision("qty", {doctype: "Quotation Estimation Item"}));
		const rows = (doc.custom_estimation_items || []).map((row, index) => `<tr>
			<td>${index + 1}</td><td>${esc(row.code)}</td><td>${esc(row.description)}</td><td>${esc(row.uom)}</td>
			<td class="text-right">${num(row.qty)}</td><td class="text-right">${money(row.rate)}</td>
			<td class="text-right">${money(row.amount)}</td><td></td></tr>`).join("");
		const summary = (label, amount, extra = "", difference = "", bold = false) => `<tr${bold ? ' class="bold"' : ""}>
			<td colspan="${extra ? 4 : 6}">${esc(__(label))}</td>${extra}
			<td class="text-right">${money(amount)}</td><td class="text-right">${difference}</td></tr>`;
		const percent = value => `<td class="text-right">%</td><td class="text-right">${num(value)}</td>`;
		const empty = `<tr><td colspan="8" class="text-muted text-center">${esc(__("Add rows in Estimation Costs to build the sheet."))}</td></tr>`;
		field.$wrapper.html(`<div class="table-responsive"><table class="table table-bordered table-condensed">
			<thead><tr><th>${esc(__("Sl. No"))}</th><th>${esc(__("Code"))}</th><th>${esc(__("Description"))}</th>
			<th>${esc(__("Unit"))}</th><th class="text-right">${esc(__("Qty"))}</th><th class="text-right">${esc(__("Unit Price"))}</th>
			<th class="text-right">${esc(__("Total Price"))}</th><th class="text-right">${esc(__("Difference Value (Co Net Profit)"))}</th></tr></thead>
			<tbody>${rows || empty}
			${summary("Total Estimated Value", doc.custom_total_estimated_value, "", "", true)}
			${summary("Sale Value without TAX/VAT", doc.custom_sale_value_without_tax, "", money(doc.custom_net_profit), true)}
			${summary("VAT", doc.custom_vat_amount, percent(doc.custom_vat_percent))}
			${summary("Tax", doc.custom_tax_amount, percent(doc.custom_tax_percent))}
			${summary("Total Quoted / Invoice Value", doc.custom_total_quoted_value, "", "", true)}
			</tbody></table></div>`);
	};

	// Finished-item group for forms outside the sales flow (BOM, Designing, Documents).
	jagadamba.sales_flow.load_finished_item_group = async function (frm, type_field) {
		const doc = frm.doc;
		const type = type_field ? doc[type_field] : null;
		const response = await frappe.call({
			method: "jagadamba.jagadamba.type_settings.get_finished_item_group",
			args: {type_name: type || null},
		});
		if (frm.doc === doc && (!type_field || doc[type_field] === type)) {
			frm.__jagadamba_finished_item_group = (response && response.message) || "";
		}
	};

	jagadamba.sales_flow.finished_item_filters = function (frm, filters = {}) {
		const result = {disabled: 0, ...filters};
		if (frm.__jagadamba_finished_item_group) result.item_group = frm.__jagadamba_finished_item_group;
		return result;
	};
})();
