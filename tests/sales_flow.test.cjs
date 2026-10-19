const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handlers = {};
const pending = [];
const context = vm.createContext({console, Promise, WeakMap, Map, Set,
	flt: (value, digits) => digits == null ? Number(value || 0) : Number(Number(value || 0).toFixed(digits)), precision: () => 2, __: value => value,
	setTimeout: () => {},
	frappe: {
		provide: () => { context.jagadamba = {sales_flow: {}}; },
		call: async ({args}) => ({message: {
			enable_estimation: args.type_name === 'Oil & Gas' ? 1 : 0,
			show_additional_items: args.type_name === 'Trailers' ? 1 : 0,
		}}),
		db: {get_value: (...args) => new Promise(resolve => pending.push({args, resolve}))},
		ui: {form: {on: (doctype, events) => {
			for (const [name, handler] of Object.entries(events)) {
				(handlers[`${doctype}.${name}`] ||= []).push(handler);
			}
		}}},
	},
});
for (const file of ['sales_flow', 'lead', 'opportunity', 'quotation', 'sales_order', 'prospect', 'purchase_order']) {
	vm.runInContext(fs.readFileSync(`jagadamba/public/js/${file}.js`, 'utf8'), context);
}
function form(doctype, data, isNew=true) {
	const frm = {doc:{doctype, docstatus:0, custom_enable_estimation: data.custom_types === "Oil & Gas" ? 1 : 0, ...data}, writes:[], is_new:()=>isNew,
		set_query:()=>{},get_field:()=>null,add_custom_button:()=>{},refresh_fields:()=>{},refresh_field:()=>{},
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
	await test('quotation selection copies type and item, not pricing',async()=>{
		const frm=form('Sales Order',{custom_quotation:'Q1',custom_types:'Oil & Gas',custom_vat_percent:5});
		const task=handlers['Sales Order.custom_quotation'][0](frm);
		const refresh=flow.copy_from_source(frm,{doctype:'Quotation',link_field:'custom_quotation',fields:{custom_types:'custom_types'}});
		assert.equal(pending.length,1);assert.deepEqual([...pending[0].args[2]].sort(),['custom_types','custom_vehicle_type','oil_gas_item']);
		resolveNext({custom_types:'Oil & Gas',custom_vehicle_type:'',oil_gas_item:'PIPE'});await Promise.all([task,refresh]);
		assert.equal(frm.doc.oil_gas_item,'PIPE');assert.equal(frm.doc.custom_vat_percent,5);
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
	await test('sales order requirement example uses net total as cost',async()=>{
		const frm=form('Sales Order',{custom_enable_estimation:1,
			custom_sale_value_without_tax:85750,custom_vat_percent:5,custom_tax_percent:10,net_total:84250});
		await flow.recalculate(frm);
		assert.equal(frm.doc.custom_total_estimated_value,84250);assert.equal(frm.doc.custom_net_profit,1500);
		assert.equal(frm.doc.custom_vat_amount,4287.5);assert.equal(frm.doc.custom_tax_amount,9003.75);
		assert.equal(frm.doc.custom_total_quoted_value,99041.25);
	});
	await test('selectable tax base',async()=>{
		const frm=form('Sales Order',{custom_enable_estimation:1,net_total:1,
			custom_sale_value_without_tax:100,custom_vat_percent:5,custom_tax_percent:10,custom_tax_basis:'Sale Value'});
		await flow.recalculate(frm);assert.equal(frm.doc.custom_tax_amount,10);assert.equal(frm.doc.custom_total_quoted_value,115);
	});
	await test('configuration works with a renamed type and no fixed item group',async()=>{
		const original=context.frappe.call;
		context.frappe.call=async()=>({message:{enable_estimation:1,show_additional_items:0,finished_item_group:'Custom Equipment'}});
		try {
			const frm=form('Quotation',{custom_types:'Fabrication',company:'Company A'},false);
			await flow.configure(frm);
			assert.equal(frm.doc.custom_enable_estimation,1);assert.equal(frm.doc.custom_show_additional_items,0);
			assert.deepEqual(JSON.parse(JSON.stringify(flow.item_filters(frm))),{disabled:0,custom_types:'Fabrication',custom_company:'Company A'});
			assert.equal(frm.writes.length,0);
		} finally {context.frappe.call=original;}
	});
	await test('out of order type configuration cannot restore old visibility',async()=>{
		const original=context.frappe.call;const requests=[];
		context.frappe.call=()=>new Promise(resolve=>requests.push(resolve));
		try {
			const frm=form('Quotation',{custom_types:'Oil & Gas'},false);
			const old=flow.configure(frm);frm.doc.custom_types='Trailers';const latest=flow.configure(frm);
			requests[1]({message:{enable_estimation:0,show_additional_items:1}});await latest;
			requests[0]({message:{enable_estimation:1,show_additional_items:0}});await old;
			assert.equal(frm.doc.custom_enable_estimation,0);assert.equal(frm.doc.custom_show_additional_items,1);
		} finally {context.frappe.call=original;}
	});
	await test('type switching keeps additional items',async()=>{
		const frm=form('Quotation',{custom_types:'Oil & Gas',custom_additional_items:[{item_code:'AXLE'}]},false);
		await frm.set_value('custom_types','Trailers');
		assert.equal(frm.doc.custom_show_additional_items,1);assert.equal(frm.doc.custom_additional_items.length,1);
		assert.ok(frm.writes.every(values=>Object.keys(values).every(key=>!/estimat|vat|tax|quoted|profit/.test(key))));
	});
	await test('finished-item links use the server query with the document type',async()=>{
		const queries={};
		const frm=form('Quotation',{custom_types:'Oil & Gas',company:'Jagadamba'});
		frm.fields_dict={custom_vehicle_type:{},oil_gas_item:{}};
		frm.set_query=(field,fn)=>{queries[field]=fn;};
		for (const handler of handlers['Quotation.setup']) handler(frm);
		assert.deepEqual(JSON.parse(JSON.stringify(queries.oil_gas_item())),{query:'jagadamba.jagadamba.type_settings.finished_item_query',filters:{type:'Oil & Gas',company:'Jagadamba'}});
		frm.doc.custom_types='Trailers';
		assert.equal(queries.custom_vehicle_type().filters.type,'Trailers');
		const documents=form('Documents',{type:'Trailers'});documents.fields_dict={vehicle_type:{}};
		documents.set_query=(field,fn)=>{queries['documents.'+field]=fn;};
		for (const handler of handlers['Documents.setup']) handler(documents);
		assert.deepEqual(JSON.parse(JSON.stringify(queries['documents.vehicle_type']().filters)),{type:'Trailers',parent_item:1});
		assert.equal(handlers['Designing.setup'],undefined);
	});
	await test('a new form without type still configures',async()=>{
		const frm=form('Quotation',{});
		await flow.configure(frm,true);await flow.configure(frm,true);
		assert.equal(frm.doc.custom_enable_estimation,0);
	});
	await test('additional items filter by row item group only',async()=>{
		const queries={};
		const frm=form('Quotation',{custom_types:'Oil & Gas',company:'Jagadamba'});
		frm.fields_dict={};frm.set_query=(field,table,fn)=>{queries[field+'.'+table]=fn;};
		for (const handler of handlers['Quotation.setup']) handler(frm);
		context.locals={'Quotation Additional Item':{r1:{item_group:'Axles'}}};
		assert.deepEqual(JSON.parse(JSON.stringify(queries['item_code.custom_additional_items'](frm.doc,'Quotation Additional Item','r1'))),
			{filters:{disabled:0,item_group:['descendants of (inclusive)','Axles']}});
	});
	await test('quotation costing: cost from rows, profit from items net total',async()=>{
		const rows=[[10,5000],[1,1000],[1000,20],[1,10000],[10,250],[7.5,100]].map(([qty,rate])=>({qty,rate,amount:qty*rate}));
		const frm=form('Quotation',{custom_enable_estimation:1,custom_costing:rows,net_total:85750,custom_vat_percent:5});
		await handlers['Quotation Cost Estimate.custom_costing_remove'][0](frm);
		assert.equal(frm.doc.custom_total_estimated_value,84250);assert.equal(frm.doc.custom_net_profit,1500);
		assert.ok(frm.writes.every(values=>Object.keys(values).every(key=>!/vat|tax|quoted|sale_value/.test(key))));
		const count=frm.writes.length;await handlers['Quotation Cost Estimate.custom_costing_remove'][0](frm);
		assert.equal(frm.writes.length,count,'no rewrite when unchanged');
	});
	await test('costing code lists non-stock items and fills a plain-text description',async()=>{
		const queries={};const frm=form('Quotation',{});frm.fields_dict={};
		frm.set_query=(field,table,fn)=>{queries[field+'.'+table]=fn;};
		for (const handler of handlers['Quotation.setup']) handler(frm);
		assert.deepEqual(JSON.parse(JSON.stringify(queries['item.custom_costing']())),{filters:{disabled:0,is_stock_item:0}});
		const row={item:'LAB'};context.locals={'Quotation Cost Estimate':{c1:row}};
		context.frappe.model={set_value:async(cdt,cdn,field,value)=>{context.locals[cdt][cdn][field]=value;}};
		context.frappe.utils={html2text:html=>html.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&')};
		const task=handlers['Quotation Cost Estimate.item'][0](frm,'Quotation Cost Estimate','c1');
		resolveNext({item_name:'Labour',description:'<div><p>Welding &amp; fit-up</p></div>'});await task;
		assert.equal(row.description,'Welding & fit-up');
		row.item='CONS';const empty=handlers['Quotation Cost Estimate.item'][0](frm,'Quotation Cost Estimate','c1');
		resolveNext({item_name:'Consumables',description:'<p></p>'});await empty;assert.equal(row.description,'Consumables');
	});
	await test('job item from the lead is added on a new quotation',async()=>{
		const set=[];context.frappe.model={set_value:async(cdt,cdn,field,value)=>{set.push([cdn,field,value]);}};
		const frm=form('Quotation',{custom_types:'Oil & Gas',oil_gas_item:'PUMP',quotation_to:'Customer',items:[{doctype:'Quotation Item',name:'i1'}]});
		frm.doc.custom_show_job_item=1;
		const original=context.frappe.call;
		context.frappe.call=async()=>({message:{enable_estimation:1,show_job_item:1}});
		try { await handlers['Quotation.refresh'][0](frm); } finally {context.frappe.call=original;}
		assert.deepEqual(set,[['i1','item_code','PUMP']]);
	});
	await test('costing row amount is qty x unit price',async()=>{
		const row={doctype:'Quotation Cost Estimate',name:'c1',qty:1000,rate:20};
		const frm=form('Quotation',{custom_enable_estimation:1,custom_costing:[row],net_total:25000});
		context.locals={'Quotation Cost Estimate':{c1:row}};
		context.frappe.model={set_value:async(cdt,cdn,field,value)=>{context.locals[cdt][cdn][field]=value;}};
		await handlers['Quotation Cost Estimate.rate'][0](frm,'Quotation Cost Estimate','c1');
		assert.equal(row.amount,20000);assert.equal(frm.doc.custom_total_estimated_value,20000);assert.equal(frm.doc.custom_net_profit,5000);
	});
	await test('job item becomes the quoted line in items',async()=>{
		const set=[];context.frappe.model={set_value:async(cdt,cdn,field,value)=>{set.push([cdn,field,value]);
			frm.doc.items.find(row=>row.name===cdn)[field]=value;}};
		const frm=form('Quotation',{custom_show_job_item:1,items:[{doctype:'Quotation Item',name:'i1',qty:0}]});
		frm.add_child=(table,values={})=>{const row={doctype:'Quotation Item',name:'i'+(frm.doc[table].length+1),...values};frm.doc[table].push(row);return row;};
		const handler=handlers['Quotation.oil_gas_item'][0];
		frm.doc.oil_gas_item='PUMP';await handler(frm);
		assert.deepEqual(set,[['i1','item_code','PUMP']]);assert.equal(frm.doc.items[0].qty,1);
		await handler(frm);assert.equal(set.length,1,'not added twice');
		frm.doc.oil_gas_item='SKID';await handler(frm);
		assert.deepEqual(set[1],['i1','item_code','SKID']);assert.equal(frm.doc.items.length,1,'job item swapped in place');
		frm.doc.oil_gas_item='';await handler(frm);assert.equal(frm.doc.items[0].item_code,'SKID','clearing keeps items');
		frm.doc.items[0].item_code='OTHER';frm.doc.oil_gas_item='TANK';await handler(frm);
		assert.equal(frm.doc.items.length,2);assert.equal(frm.doc.items[1].item_code,'TANK');
		const trading=form('Quotation',{custom_show_job_item:0,oil_gas_item:'PUMP',items:[]});
		await handler(trading);assert.equal(set.length,3,'types without a job item leave items alone');
	});
	await test('downstream documents inherit type from the first source that is set',async()=>{
		const frm=form('Stock Entry',{project:'P1',work_order:'WO1'});
		await handlers['Stock Entry.work_order'][0](frm);assert.equal(pending.length,0,'project wins over work order');
		const task=handlers['Stock Entry.refresh'][0](frm);
		assert.equal(pending[0].args[0],'Project');resolveNext({custom_types:'Oil & Gas',oil_gas_item:'PUMP'});await task;
		assert.equal(frm.doc.custom_types,'Oil & Gas');assert.equal(frm.doc.oil_gas_item,'PUMP');
		await handlers['Stock Entry.refresh'][0](frm);assert.equal(pending.length,0,'filled forms do not refetch');
		const card=form('Job Card',{work_order:'WO1',custom_types:'Trailers'});
		const change=handlers['Job Card.work_order'][0](card);
		resolveNext({custom_types:'Oil & Gas',oil_gas_item:'PUMP'});await change;assert.equal(card.doc.custom_types,'Oil & Gas');
		const submitted=form('Sales Invoice',{project:'P1',docstatus:1});
		await handlers['Sales Invoice.refresh'][0](submitted);assert.equal(submitted.writes.length,0);
	});
	await test('purchase order takes type from the material request before the project',async()=>{
		const frm=form('Purchase Order',{project:'P1',items:[{material_request:'MR1'}]});
		const task=handlers['Purchase Order.refresh'][0](frm);
		assert.equal(pending[0].args[0],'Material Request');resolveNext({custom_types:'Trading'});await task;
		assert.equal(frm.doc.custom_types,'Trading');
	});
	await test('no opportunity button on prospect or lead',async()=>{
		const removed=[];const frm=form('Prospect',{});frm.remove_custom_button=(label,group)=>removed.push([label,group]);
		await handlers['Prospect.refresh'][0](frm);assert.deepEqual(removed,[['Opportunity','Create']]);
		const timers=[];context.setTimeout=fn=>timers.push(fn);
		try {
			const lead=form('Lead',{},false);const added=[];lead.remove_custom_button=(label,group)=>removed.push([label,group]);
			lead.add_custom_button=label=>added.push(label);
			await handlers['Lead.refresh'][0](lead);timers.forEach(fn=>fn());
			assert.ok(removed.some(([label,group])=>label==='Opportunity'&&group==='Create'));assert.deepEqual(added,[]);
		} finally {context.setTimeout=()=>{};}
	});
	console.log(`PASS: ${passed} sales-flow regression cases`);
})().catch(error=>{console.error(error);process.exitCode=1;});
