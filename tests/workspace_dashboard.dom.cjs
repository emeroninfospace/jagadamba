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
    const fixture = {company:'Allowed Co',companies:[{name:'Allowed Co'},{name:'Other Co'}],business_units:['Trading'],
        start:'2026-10-01',end:'2026-10-12',currency:'AED',note:'Visible records only.',sections:[{
            doctype:'Sales Order',total:2,amount:100,date_field:'transaction_date',status_field:'status',
            statuses:[{label:'<img src=x onerror=alert(1)>',value:2}],divisions:[],trend:[{label:'2026-10',value:2}],
            recent:[{name:'SO-001',transaction_date:'2026-10-12',status:'Draft'}],
            filters:[['Sales Order','company','=','Allowed Co'],['Sales Order','docstatus','!=',2],
                ['Sales Order','transaction_date','>=','2026-10-01'],['Sales Order','transaction_date','<','2026-10-13']]
        }]};
    w.frappe = {
        provide:()=>w.jagadamba={workspace:{}}, model:{unscrub:v=>v.replaceAll('_',' ')},
        router:{slug:v=>v.toLowerCase().replaceAll(' ','-')},set_route:(...args)=>w.routes.push(args),
        call:async()=>({message:fixture}),
    };
    const root=w.document.querySelector('main').attachShadow({mode:'open'});
    root.innerHTML='<div class="jg-dashboard"></div>';
    w.eval(fs.readFileSync('jagadamba/public/js/workspace_dashboard.js','utf8'));
    w.jagadamba.workspace.mount(root,'sales'); await tick();
    assert.equal(root.querySelectorAll('.jg-metric').length,1);
    assert.equal(root.querySelectorAll('img').length,0);
    assert.ok(root.textContent.includes('<img src=x onerror=alert(1)>'));
    root.querySelector('.jg-metric').click();
    assert.equal(w.routes[0][3].company,'Allowed Co');
    assert.equal(JSON.stringify(w.routes[0][3].transaction_date),JSON.stringify(['between',['2026-10-01','2026-10-12 23:59:59']]));
    w.jagadamba.workspace.mount(root,'sales');await tick();
    assert.equal(root.querySelectorAll('.jg-hero').length,1,'mount is idempotent');
    const pending=[];w.frappe.call=({args})=>new Promise(resolve=>pending.push({args,resolve}));
    root.querySelector('.jg-refresh').click();
    const company=root.querySelector('select');company.value='Other Co';company.dispatchEvent(new w.Event('change'));
    assert.equal(pending.length,2);
    pending[1].resolve({message:{...fixture,company:'Other Co',sections:[]}});await tick();
    pending[0].resolve({message:fixture});await tick();
    assert.equal(company.value,'Other Co');assert.equal(root.querySelectorAll('.jg-metric').length,0);
    w.frappe.call=()=>Promise.reject(new Error('Denied'));
    root.querySelector('.jg-refresh').click();await tick();
    assert.ok(root.querySelector('.jg-status').textContent.includes('Unable to load'));
    assert.equal(root.querySelector('.jg-refresh').disabled,false);
    const period=root.querySelectorAll('select')[2];period.value='custom';period.dispatchEvent(new w.Event('change'));
    assert.ok(root.querySelector('.jg-status').textContent.includes('Choose both dates'));
    assert.equal(root.querySelector('input').parentElement.hidden,false);
    // Valid retry and a detached block must not receive a late response.
    period.value='this_month';w.frappe.call=async()=>({message:fixture});period.dispatchEvent(new w.Event('change'));await tick();
    assert.equal(root.querySelectorAll('.jg-metric').length,1);
    let resolve;w.frappe.call=()=>new Promise(r=>resolve=r);root.querySelector('.jg-refresh').click();
    root.host.remove();resolve({message:fixture});await tick();assert.equal(root.querySelectorAll('.jg-metric').length,0);
    dom.window.close();
    console.log('PASS: DOM rendering, safe text, drill-down filters, idempotent mounting, stale-response rejection, error recovery, custom dates, detached-block handling.');
})().catch(error=>{console.error(error);process.exitCode=1});
