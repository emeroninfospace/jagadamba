// Run with jsdom installed: node tests/workspace_dashboard.dom.cjs
const { JSDOM } = require(process.env.JAGADAMBA_JSDOM || 'jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
    const dom = new JSDOM('<main id="workspace"></main>', {runScripts:'outside-only',url:'https://erp.example.test'});
    const w = dom.window;
    w.__ = value => value;
    w.routes = [];
    w.created = [];
    const filters = [['Sales Order','company','=','Allowed Co'],['Sales Order','docstatus','!=',2],
        ['Sales Order','transaction_date','>=','2026-10-01'],['Sales Order','transaction_date','<','2026-10-13']];
    const fixture = {title:'Turn enquiries into orders',eyebrow:'Sales',subtitle:'Desk',accent:'#4f46e5',
        company:'Allowed Co',companies:[{name:'Allowed Co'},{name:'Other Co'}],business_units:['Trading'],
        start:'2026-10-01',end:'2026-10-12',previous_start:'2026-09-19',previous_end:'2026-09-30',currency:'AED',note:'Visible records only.',
        sections:[{doctype:'Sales Order',label:'Sales Order',total:2,previous_total:1,amount:100,amount_label:'Order value',
            date_field:'transaction_date',status_field:'status',party_field:'customer',party_label:'Customer',amount_field:'base_grand_total',
            statuses:[{label:'<img src=x onerror=alert(1)>',value:2}],divisions:[],top:[{label:'Cust A',value:2,amount:100}],
            trend:[{label:'2026-10',value:2,amount:100}],
            recent:[{name:'SO-001',transaction_date:'2026-10-12',status:'Draft',customer:'Cust A',base_grand_total:100}],
            alert:{label:'Delivery overdue',count:1,filters:[['Sales Order','company','=','Allowed Co'],['Sales Order','delivery_date','<','2026-10-12']]},
            filters}]};
    w.frappe = {
        provide:()=>w.jagadamba={workspace:{}}, model:{unscrub:v=>v.replaceAll('_',' '),can_create:dt=>dt==='Sales Order'},
        router:{slug:v=>v.toLowerCase().replaceAll(' ','-')},set_route:(...args)=>w.routes.push(args),
        new_doc:dt=>w.created.push(dt), call:async()=>({message:fixture}),
    };
    const root=w.document.querySelector('main').attachShadow({mode:'open'});
    root.innerHTML='<div class="jg-dashboard"></div>';
    w.eval(fs.readFileSync('jagadamba/public/js/workspace_dashboard.js','utf8'));
    w.jagadamba.workspace.mount(root,'sales'); await tick();
    assert.equal(root.querySelectorAll('.jg-metric').length,1);
    assert.equal(root.querySelector('.jg-title').textContent,'Turn enquiries into orders');
    assert.equal(root.querySelectorAll('img').length,0);
    assert.ok(root.textContent.includes('<img src=x onerror=alert(1)>'));
    assert.equal(root.querySelector('.jg-metric-number').dataset.value,'2');
    assert.ok(root.querySelector('.jg-delta').textContent.includes('100%'));
    root.querySelector('.jg-metric-main').click();
    assert.equal(w.routes[0][3].company,'Allowed Co');
    assert.equal(JSON.stringify(w.routes[0][3].transaction_date),JSON.stringify(['between',['2026-10-01','2026-10-12 23:59:59']]));
    root.querySelector('.jg-alert').click();
    assert.equal(JSON.stringify(w.routes[1][3].delivery_date),JSON.stringify(['<','2026-10-12']));
    root.querySelector('.jg-legend-item').click();
    assert.equal(w.routes[2][3].status,'<img src=x onerror=alert(1)>');
    root.querySelector('.jg-action').click();
    assert.deepEqual(w.created,['Sales Order']);
    assert.ok(root.querySelector('.jg-panel-rank .jg-panel-title').textContent.includes('Customer'));
    w.jagadamba.workspace.mount(root,'sales');await tick();
    assert.equal(root.querySelectorAll('.jg-hero').length,1,'mount is idempotent');
    // Business-unit chip sends the unit; a stale earlier response must not win.
    const pending=[];w.frappe.call=({args})=>new Promise(resolve=>pending.push({args,resolve}));
    root.querySelector('.jg-refresh').click();
    const company=root.querySelector('select[aria-label="Company"]');company.value='Other Co';company.dispatchEvent(new w.Event('change'));
    assert.equal(pending.length,2);
    pending[1].resolve({message:{...fixture,company:'Other Co',sections:[]}});await tick();
    pending[0].resolve({message:fixture});await tick();
    assert.equal(company.value,'Other Co');assert.equal(root.querySelectorAll('.jg-metric').length,0);
    const unit=[...root.querySelectorAll('.jg-chip')].find(node=>node.dataset.value==='Trading');
    unit.click();assert.equal(pending[2].args.business_unit,'Trading');
    pending[2].resolve({message:fixture});await tick();
    assert.equal(root.querySelector('.jg-chip[data-value="Trading"]').getAttribute('aria-pressed'),'true');
    w.frappe.call=()=>Promise.reject(new Error('Denied'));
    root.querySelector('.jg-refresh').click();await tick();
    assert.ok(root.querySelector('.jg-status').textContent.includes('Unable to load'));
    assert.equal(root.querySelector('.jg-refresh').disabled,false);
    root.querySelector('.jg-chip[data-value="custom"]').click();
    assert.ok(root.querySelector('.jg-status').textContent.includes('Choose both dates'));
    assert.equal(root.querySelector('.jg-dates').hidden,false);
    // Valid retry and a detached block must not receive a late response.
    w.frappe.call=async()=>({message:fixture});root.querySelector('.jg-chip[data-value="this_month"]').click();await tick();
    assert.equal(root.querySelectorAll('.jg-metric').length,1);
    let resolve;w.frappe.call=()=>new Promise(r=>resolve=r);root.querySelector('.jg-refresh').click();
    root.host.remove();resolve({message:fixture});await tick();assert.equal(root.querySelectorAll('.jg-metric').length,0);
    dom.window.close();
    await classicLayout();
    console.log('PASS: DOM rendering, classic snapshot and comparison chart, safe text, drill-down and attention filters, quick create, idempotent mounting, stale-response rejection, unit chips, error recovery, custom dates, detached-block handling.');
})().catch(error=>{console.error(error);process.exitCode=1});

async function classicLayout() {
    const dom = new JSDOM('<main></main>', {runScripts:'outside-only',url:'https://erp.example.test'});
    const w = dom.window;
    w.__ = value => value; w.routes = []; w.calls = [];
    const series = (label, values) => ({label, color:'#5f9a78', doctype:`${label} Invoice`, date_field:'posting_date',
        values, total: values.reduce((a, b) => a + b, 0),
        filters:[[`${label} Invoice`,'company','=','Allowed Co'],[`${label} Invoice`,'posting_date','>=','2026-09-01'],[`${label} Invoice`,'posting_date','<','2026-10-13']]});
    const fixture = {layout:'Classic', title:'Business Overview', company:'Jagdamba Global Equipment', companies:[{name:'Jagdamba Global Equipment'}],
        business_units:[], start:'2026-09-01', end:'2026-10-12', previous_start:'2026-07-21', previous_end:'2026-08-31', currency:'AED', note:'', sections:[],
        kpis:[{label:'Receivable', icon:'receivable', doctype:'Sales Invoice', aggregate:'Sum', value:147500, caption:'18 open invoices',
            filters:[['Sales Invoice','company','=','Jagdamba Global Equipment'],['Sales Invoice','outstanding_amount','>',0]], date_field:null}],
        comparison:{title:'Sales & Purchase Overview', labels:['2026-09','2026-10'], start:'2026-09-01', end:'2026-10-12',
            series:[series('Sales',[100,50]), series('Purchase',[40,30])], difference:{label:'Profit', total:80}}};
    w.frappe = {provide:()=>w.jagadamba={workspace:{}}, model:{unscrub:v=>v, can_create:()=>false}, router:{slug:v=>v},
        set_route:(...args)=>w.routes.push(args), new_doc:()=>{},
        call:async ({method, args})=>{ w.calls.push({method, args});
            return {message: method.endsWith('get_comparison') ? {...fixture.comparison, labels:['2026-01'], series:[series('Sales',[999]), series('Purchase',[1])], difference:{label:'Profit', total:998}} : fixture}; }};
    const root = w.document.querySelector('main').attachShadow({mode:'open'});
    root.innerHTML = '<div class="jg-dashboard"></div>';
    w.eval(fs.readFileSync('jagadamba/public/js/workspace_dashboard.js','utf8'));
    w.jagadamba.workspace.mount(root, 'accounting'); await tick();
    assert.ok(root.querySelector('.jg-dashboard').classList.contains('jg-classic'));
    assert.equal(root.querySelector('.jg-head').hidden, false);
    assert.equal(root.querySelector('.jg-hero').hidden, true);
    assert.equal(root.querySelector('.jg-badge-mark').textContent, 'JG');
    assert.equal(root.querySelector('.jg-head-title').textContent, 'Business Overview');
    assert.equal(root.querySelector('.jg-kpi-caption').textContent, '18 open invoices');
    root.querySelector('.jg-kpi').click();
    assert.equal(JSON.stringify(w.routes[0][3].outstanding_amount), JSON.stringify(['>',0]));
    assert.equal(root.querySelectorAll('.jg-cbar').length, 4);
    assert.ok(root.querySelector('.jg-compare-diff').textContent.includes('Profit'));
    root.querySelectorAll('.jg-hit')[0].dispatchEvent(new w.MouseEvent('mousemove'));
    assert.ok(root.querySelector('.jg-tooltip').textContent.includes('Profit: 60 (60%)'));
    root.querySelectorAll('.jg-hit')[1].dispatchEvent(new w.MouseEvent('click'));
    assert.equal(JSON.stringify(w.routes[1][3].posting_date), JSON.stringify(['between',['2026-10-01','2026-10-31']]));
    const [start, finish] = root.querySelectorAll('.jg-compare-range input');
    start.value = '2026-01-01'; finish.value = '2026-01-31';
    root.querySelector('.jg-compare-apply').click(); await tick();
    assert.equal(w.calls.at(-1).method, 'jagadamba.jagadamba.workspace_dashboard.get_comparison');
    assert.equal(w.calls.at(-1).args.date_from, '2026-01-01');
    assert.equal(root.querySelectorAll('.jg-cbar').length, 2);
    root.querySelector('.jg-compare-reset').click();
    assert.equal(root.querySelectorAll('.jg-cbar').length, 4);
    const period = root.querySelector('.jg-head-period');
    period.value = 'this_year'; period.dispatchEvent(new w.Event('change')); await tick();
    assert.equal(w.calls.at(-1).args.period, 'this_year');
    dom.window.close();
}
