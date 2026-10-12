const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handlers = {};
const pending = [];
const context = vm.createContext({console, Promise, WeakMap, Map, Set,
	flt: value => Number(value || 0), __: value => value,
	setTimeout: () => {},
	frappe: {
		provide: () => { context.jagadamba = {sales_flow: {}}; },
		db: {get_value: (...args) => new Promise(resolve => pending.push({args, resolve}))},
		ui: {form: {on: (doctype, events) => {
			for (const [name, handler] of Object.entries(events)) {
				(handlers[`${doctype}.${name}`] ||= []).push(handler);
			}
		}}},
	},
});
for (const file of ['sales_flow', 'lead', 'opportunity', 'quotation', 'sales_order']) {
	vm.runInContext(fs.readFileSync(`jagadamba/public/js/${file}.js`, 'utf8'), context);
}
function form(doctype, data, isNew=true) {
	const frm = {doc:{doctype, docstatus:0, ...data}, writes:[], is_new:()=>isNew,
		set_query:()=>{},get_field:()=>null,add_custom_button:()=>{},
		async set_value(field, value) {
			const values = typeof field === 'string' ? {[field]:value} : field;
			this.writes.push({...values});
			for (const [key, next] of Object.entries(values)) {
				if (this.doc[key] === next) continue;
				this.doc[key]=next;
				for (const handler of handlers[`${doctype}.${key}`] || []) await handler(this);
			}
		},
	};
	return frm;
}
const flow=context.jagadamba.sales_flow;
const options={doctype:'Lead',link_field:'party_name',fields:{custom_types:'custom_types',custom_vehicle_type:'custom_vehicle_type',custom_finished_item:'oil_gas_item'}};
const resolveNext = data => pending.shift().resolve({message:data});
let passed=0;
async function test(name, fn) { await fn(); assert.equal(pending.length,0,`${name}: pending requests`);passed++; }
(async()=>{
	await test('mapped type does not clear mapped item',async()=>{
		const frm=form('Opportunity',{party_name:'L1',opportunity_from:'Lead'});
		const task=flow.copy_from_source(frm,options);resolveNext({custom_types:'Oil & Gas',oil_gas_item:'PIPE'});await task;
		assert.equal(frm.doc.custom_finished_item,'PIPE');
		await frm.set_value('custom_types','Trading');assert.equal(frm.doc.custom_finished_item,'');
	});
	await test('late old source ignored',async()=>{
		const frm=form('Opportunity',{party_name:'L1'});
		const old=flow.copy_from_source(frm,options);frm.doc.party_name='L2';
		const current=flow.copy_from_source(frm,options);
		const a=pending.shift(),b=pending.shift();b.resolve({message:{custom_types:'Trailers',custom_vehicle_type:'TRAILER'}});await current;
		a.resolve({message:{custom_types:'Oil & Gas',oil_gas_item:'PIPE'}});await old;
		assert.equal(frm.doc.custom_vehicle_type,'TRAILER');assert.equal(frm.doc.custom_types,'Trailers');
	});
	await test('user type edit during lookup is preserved',async()=>{
		const frm=form('Opportunity',{party_name:'L1'});const task=flow.copy_from_source(frm,options);
		frm.doc.custom_types='Trading';resolveNext({custom_types:'Oil & Gas',oil_gas_item:'PIPE'});await task;
		assert.equal(frm.doc.custom_finished_item,undefined);
	});
	await test('concurrent refreshes share one lookup',async()=>{
		const frm=form('Opportunity',{party_name:'L1'});
		const a=flow.copy_from_source(frm,options),b=flow.copy_from_source(frm,options);
		assert.equal(pending.length,1);resolveNext({custom_types:'Trading'});await Promise.all([a,b]);
		assert.equal(frm.writes.length,1);
	});
	await test('quotation selection copies zero and supersedes refresh',async()=>{
		const frm=form('Sales Order',{custom_quotation:'Q1',custom_types:'Oil & Gas',custom_vat_percent:5,custom_tax_percent:2,custom_sale_value_without_tax:100});
		const task=handlers['Sales Order.custom_quotation'][0](frm);
		const refresh=flow.copy_from_source(frm,{doctype:'Quotation',link_field:'custom_quotation',fields:{custom_types:'custom_types'}});
		assert.equal(pending.length,1);resolveNext({custom_types:'Oil & Gas',custom_vehicle_type:'',oil_gas_item:'PIPE',custom_sale_value_without_tax:0,custom_vat_percent:0,custom_tax_percent:0});await Promise.all([task,refresh]);
		assert.equal(frm.doc.custom_vat_percent,0);assert.equal(frm.doc.custom_sale_value_without_tax,0);assert.equal(frm.doc.oil_gas_item,'PIPE');
	});
	await test('edited pricing survives a pending mapping',async()=>{
		const frm=form('Sales Order',{custom_quotation:'Q1',custom_vat_percent:5});const task=handlers['Sales Order.custom_quotation'][0](frm);
		frm.doc.custom_vat_percent=7;resolveNext({custom_types:'Oil & Gas',custom_vat_percent:0});await task;assert.equal(frm.doc.custom_vat_percent,7);
	});
	await test('submitted documents are never recalculated or mapped',async()=>{
		const frm=form('Sales Order',{docstatus:1,custom_types:'Oil & Gas',custom_quotation:'Q1',custom_total_quoted_value:88});
		await flow.recalculate(frm);await handlers['Sales Order.custom_quotation'][0](frm);
		assert.equal(frm.writes.length,0);assert.equal(frm.doc.custom_total_quoted_value,88);
	});
	await test('calculation matches existing formula and skips identical writes',async()=>{
		const frm=form('Sales Order',{custom_types:'Oil & Gas',custom_sale_value_without_tax:1000,custom_vat_percent:5,custom_tax_percent:2,net_total:600});
		await flow.recalculate(frm);assert.equal(frm.doc.custom_total_quoted_value,1071);assert.equal(frm.doc.custom_net_profit,400);
		const count=frm.writes.length;await flow.recalculate(frm);assert.equal(frm.writes.length,count);
	});
	await test('old document instance is ignored after navigation',async()=>{
		const frm=form('Opportunity',{party_name:'L1'});const task=flow.copy_from_source(frm,options);
		frm.doc={docstatus:0,party_name:'L1'};resolveNext({custom_types:'Trading'});await task;assert.equal(frm.writes.length,0);
	});
	await test('clearing source invalidates pending lookup',async()=>{
		const frm=form('Opportunity',{party_name:'L1'});const task=flow.copy_from_source(frm,options);
		frm.doc.party_name='';await flow.copy_from_source(frm,options);resolveNext({custom_types:'Trading'});await task;assert.equal(frm.writes.length,0);
	});
	await test('lead customer lookup does not overwrite a later choice',async()=>{
		const frm=form('Lead',{custom_customers:'C1',first_name:'',last_name:''});const handler=handlers['Lead.custom_customers'][0];
		const a=handler(frm);frm.doc.custom_customers='C2';const b=handler(frm);
		const old=pending.shift(),current=pending.shift();current.resolve({message:{customer_name:'New   Customer'}});await b;
		old.resolve({message:{customer_name:'Old Customer'}});await a;assert.equal(frm.doc.first_name,'New');assert.equal(frm.doc.last_name,'Customer');
	});
	await test('refresh does not dirty saved quotation',async()=>{
		const frm=form('Quotation',{custom_types:'Oil & Gas',custom_vat_amount:0.12,custom_sale_value_without_tax:2.33,custom_vat_percent:5},false);
		await handlers['Quotation.refresh'][0](frm);assert.equal(frm.writes.length,0);
	});
	console.log(`PASS: ${passed} sales-flow regression cases`);
})().catch(error=>{console.error(error);process.exitCode=1;});
