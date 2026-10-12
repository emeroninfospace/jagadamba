// Optional: NODE_PATH=<runtime node_modules> node tests/workspace_dashboard.browser.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || undefined});
    const page = await browser.newPage({viewport: {width: 1320, height: 1050}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<style>body{margin:0;background:#f5f7f9;padding:32px;font-family:system-ui}#workspace{max-width:1160px;margin:auto}</style><main id="workspace"></main>');
    await page.evaluate(() => {
        window.__ = value => value;
        window.routes = [];
        const section = (doctype, total, status, field) => ({doctype, label: doctype, total, previous_total: total - 4, amount: null,
            date_field: field, status_field: 'status', party_field: 'workstation', party_label: 'Workstation',
            top:[{label:'Welding Bay',value:9},{label:'Paint Shop',value:6}],
            alert:{label:'Past planned end',count:3,filters:[[doctype,'company','=','Jagadamba Manufacturing'],[doctype,field,'<','2026-10-12']]},
            statuses: [{label: status, value: total-2}, {label:'Completed',value:2}],
            divisions:[{label:'Oil & Gas',value:8},{label:'Trailers',value:12},{label:'Trading',value:4}],
            trend:[{label:'2026-05',value:9},{label:'2026-06',value:16},{label:'2026-07',value:12},{label:'2026-08',value:22},{label:'2026-09',value:18},{label:'2026-10',value:total}],
            recent:[{name:'MFG-WO-2026-0042', [field]:'2026-10-12',status}, {name:'MFG-WO-2026-0041',[field]:'2026-10-11',status:'Completed'}],
            filters:[[doctype,'company','=','Jagadamba Manufacturing'],[doctype,'docstatus','!=',2],[doctype,field,'>=','2026-05-01'],[doctype,field,'<','2026-10-13']]});
        window.fixture = {company:'Jagadamba Manufacturing',companies:[{name:'Jagadamba Manufacturing',default_currency:'AED'},{name:'Trading Company',default_currency:'AED'}],
            business_units:['Oil & Gas','Trailers','Trading'],currency:'AED',start:'2026-05-01',end:'2026-10-12',previous_start:'2025-11-17',previous_end:'2026-04-30',title:'Keep production moving',eyebrow:'Manufacturing',accent:'#d97706',
            sections:[section('Work Order',24,'In Process','planned_start_date'),section('Job Card',38,'Work In Progress','posting_date')],
            note:'Only records you can read are shown. Drafts are included; cancelled documents are excluded. Sample data for design validation.'};
        window.frappe = {
            provide:()=>{window.jagadamba={workspace:{}};},
            model:{unscrub:value=>value.replaceAll('_',' '),can_create:()=>true},new_doc:()=>{},router:{slug:value=>value.toLowerCase().replaceAll(' ','-')},
            set_route:(...args)=>window.routes.push(args),
            call: async ({args})=>({message:{...window.fixture,company:args.company||window.fixture.company}}),
        };
        window.root = document.querySelector('#workspace').attachShadow({mode:'open'});
        root.innerHTML='<div class="jg-dashboard"></div>';
    });
    await page.addScriptTag({content: fs.readFileSync('jagadamba/public/js/workspace_dashboard.js','utf8')});
    await page.evaluate(css => {
        const style=document.createElement('style');style.textContent=css;root.append(style);
        jagadamba.workspace.mount(root,'production');
    },fs.readFileSync('jagadamba/public/css/workspace_dashboard.css','utf8'));
    await page.getByText('24',{exact:true}).first().waitFor();
    await page.screenshot({path:'/tmp/jagadamba-workspace-desktop.png',fullPage:true});
    await page.locator('.jg-metric-main').first().click();
    const route=await page.evaluate(()=>routes[0]);
    assert.equal(route[0],'List'); assert.equal(route[1],'Work Order');
    assert.deepEqual(route[3].planned_start_date,['between',['2026-05-01','2026-10-12 23:59:59']]);
    await page.evaluate(()=>{window.fixture.sections[0].statuses[0].label='<img src=x onerror=alert(1)>';});
    await page.getByRole('button',{name:'Refresh dashboard',exact:true}).click();
    await page.getByText('<img src=x onerror=alert(1)>',{exact:true}).first().waitFor();
    assert.equal(await page.locator('.jg-dashboard img').count(),0,'labels must be text, not HTML');
    // Stale response: select the second company, resolve its request first.
    await page.evaluate(()=>{window.pending=[];frappe.call=({args})=>new Promise(resolve=>pending.push({args,resolve}));});
    await page.getByRole('button',{name:'Refresh dashboard',exact:true}).click();
    await page.getByLabel('Company',{exact:true}).selectOption('Trading Company');
    await page.evaluate(()=>pending[1].resolve({message:{...fixture,company:'Trading Company',sections:[]}}));
    await page.getByText('No accessible sections for these filters.',{exact:false}).waitFor();
    await page.evaluate(()=>pending[0].resolve({message:fixture}));
    assert.equal(await page.getByLabel('Company',{exact:true}).inputValue(),'Trading Company');
    assert.equal(await page.locator('.jg-metric').count(),0);
    // Failed reload clears old company data and supports retry.
    await page.evaluate(()=>{frappe.call=()=>Promise.reject(new Error('Denied'));});
    await page.getByRole('button',{name:'Refresh dashboard',exact:true}).click();
    await page.getByText('Unable to load this workspace.',{exact:false}).waitFor();
    assert.equal(await page.locator('.jg-metric').count(),0);
    await page.evaluate(()=>{
        fixture.sections[0].statuses[0].label='In Process';
        frappe.call=async()=>({message:fixture});
    });
    await page.getByRole('button',{name:'Refresh dashboard',exact:true}).click();
    await page.locator('.jg-metric').first().waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/jagadamba-workspace-mobile.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.jg-metric').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.evaluate(()=>document.documentElement.style.cssText='--card-bg:#20262e;--text-color:#e5ecf0;--text-muted:#a6b3bf;--control-bg:#2a323c;--border-color:#3a434e;background:#171c22');
    await page.setViewportSize({width:1320,height:1050});
    await page.screenshot({path:'/tmp/jagadamba-workspace-dark.png',fullPage:true});
    assert.deepEqual(errors,[]);
    await browser.close();
    console.log('PASS: rendering, safe text, list drill-down, stale responses, error recovery, mobile overflow, reduced motion.');
})().catch(error=>{console.error(error);process.exit(1)});
