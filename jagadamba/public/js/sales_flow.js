/* global frappe, flt */
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

	jagadamba.sales_flow.recalculate = function (frm) {
		if (frm.doc.docstatus !== 0 || frm.doc.custom_types !== "Oil & Gas") return Promise.resolve();
		const sale = flt(frm.doc.custom_sale_value_without_tax);
		const vat = sale * flt(frm.doc.custom_vat_percent) / 100;
		const tax = (sale + vat) * flt(frm.doc.custom_tax_percent) / 100;
		const values = {
			custom_vat_amount: vat,
			custom_tax_amount: tax,
			custom_total_quoted_value: sale + vat + tax,
			custom_net_profit: sale - flt(frm.doc.net_total),
		};
		const changes = Object.fromEntries(Object.entries(values).filter(([field, value]) => flt(frm.doc[field]) !== value));
		return Object.keys(changes).length ? frm.set_value(changes) : Promise.resolve();
	};
})();
