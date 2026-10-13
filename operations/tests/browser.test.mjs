import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createOperationsServer} from '../server.mjs';
import {fixturePdf} from '../ai.mjs';
import {hash} from '../domain.mjs';

// A fresh headless context, never the user's Chrome profile. Only loopback is allowed.
const modulePath=process.env.RELO_PLAYWRIGHT_MODULE||join(process.env.USERPROFILE||'', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const chromePath=process.env.RELO_CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifacts=resolve('qa/operations');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('Local Chromium: complete workflow, responsive UI, cancellation, keyboard and persistence',{timeout:180000},async t=>{
  assert.ok(existsSync(modulePath),'Set RELO_PLAYWRIGHT_MODULE to an installed Playwright index.mjs');
  assert.ok(existsSync(chromePath),'Set RELO_CHROME_PATH to an installed Chromium executable');
  const {chromium}=await import(pathToFileURL(modulePath).href);
  await mkdir(artifacts,{recursive:true});
  const dataDir=await mkdtemp(resolve('.relo-test-browser-')),app=createOperationsServer({dataDir}),base=await app.listen(0);
  const browser=await chromium.launch({headless:true,executablePath:chromePath});
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true,serviceWorkers:'block'});
  t.after(async()=>{await context.close();await browser.close();await app.close();});
  const external=[],errors=[],measurements={browser:browser.version(),engine:'installed Chrome, headless isolated context',realDevicesTested:false,widths:[],dori:{}};
  await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base+'/')||url.startsWith('blob:')||url.startsWith('data:'))return route.continue();external.push(new URL(url).origin);return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  let claimId;
  const detail=()=>app.store.detail(app.store.user('A-admin'),claimId);
  async function login(email='a.admin@relo.test',p=page){await p.locator('[data-action="fixture-login"][data-email="'+email+'"]').click();await p.locator('#login-password').press('Enter');await p.locator('.nav').waitFor();}
  async function waitSaved(p=page){await p.locator('#modal').waitFor({state:'hidden'});await p.locator('.detail-title').waitFor();}
  async function tab(id,p=page){await p.locator('[data-tab="'+id+'"]').click();}
  async function submit(id){await page.locator('#'+id+' [type="submit"]').click();await waitSaved();}
  async function screenshot(name){await page.screenshot({path:join(artifacts,name),fullPage:true});}

  await t.test('Login with keyboard, cancel unsaved form, repeated submit saves once',async()=>{
    await page.goto(base);await login();assert.equal(await page.locator('.claims-table tbody tr').count(),1);
    await page.locator('[data-action="new"]').click();await page.locator('[name="title"]').fill('Cancelled synthetic form');await page.keyboard.press('Escape');assert.equal(app.store.list(app.store.user('A-admin')).length,1);
    await page.locator('[data-action="new"]').click();
    for(const [name,value]of Object.entries({title:'합성 모바일 회수 시험',orderRef:'BROWSER-SYN-001',orderedOn:'2026-10-01',claimedAmount:'120.00',agreedAmount:'120.00',issue:'합성 불량 4개, 실제 고객 자료 없음',issueEnglish:'Synthetic document and transaction only.','sku-0':'SYN-USB','name-0':'합성 USB 허브','orderedQty-0':'10','claimQty-0':'4','unitPrice-0':'30.00'}))await page.locator('[name="'+name+'"]').fill(value);
    await page.locator('[name="assignedTo"]').selectOption('A-agent');
    let posts=0;await page.route('**/api/claims',async route=>{if(route.request().method()==='POST'){posts++;await sleep(250);}await route.continue();});
    await page.locator('#claim-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    assert.equal(await page.locator('#claim-form [type="submit"]').isDisabled(),true);
    await waitSaved();await page.unroute('**/api/claims');assert.equal(posts,1);
    const c=app.store.list(app.store.user('A-admin')).find(c=>c.orderRef==='BROWSER-SYN-001');assert.ok(c);claimId=c.id;assert.equal(c.assignedTo,'A-agent');assert.equal(c.summary.cash,0);assert.equal(c.version,1);
    assert.equal(await page.evaluate(()=>localStorage.length),0);
  });

  await t.test('Private attachment persists once, exact synthetic extraction shows source and does not mutate',async()=>{
    await tab('files');await page.locator('#upload-file').setInputFiles({name:'synthetic-order.pdf',mimeType:'application/pdf',buffer:fixturePdf()});
    await page.waitForFunction(()=>document.querySelectorAll('.file-card').length===1);let c=detail();assert.equal(c.files.length,1);assert.equal(c.files[0].sha,hash(fixturePdf()));const version=c.version;
    await page.locator('#upload-file').setInputFiles({name:'synthetic-order.pdf',mimeType:'application/pdf',buffer:fixturePdf()});await page.waitForFunction(()=>!document.querySelector('[data-action="retry-upload"]')&&!document.querySelector('.notice:not(.warning)')?.textContent.includes('서버 저장 확인 중'));
    await sleep(150);assert.equal(detail().files.length,1);assert.equal(detail().version,version);
    await page.locator('[data-action="ai-test"]').click();await page.locator('.source-grid').waitFor();assert.equal(await page.locator('.source blockquote').count(),4);assert.match(await page.locator('#modal').innerText(),/정답셋|합성/);assert.equal(detail().version,version);await page.keyboard.press('Escape');
    await screenshot('evidence-1280.png');
  });

  await t.test('Normal Dori minimum 2500ms, rule draft saves only after review and explicit approval',async()=>{
    await tab('draft');const before=detail().version;const start=Date.now();await page.locator('[data-action="prepare-draft"]').click();await page.locator('.dori-work[data-ready="true"]').waitFor();assert.equal(await page.locator('.dori-scene').getAttribute('data-motion'),'animated');assert.equal(detail().version,before);
    await screenshot('dori-preparation-1280.png');await page.locator('#draft-form').waitFor();const elapsed=Date.now()-start;measurements.dori.normalMs=elapsed;assert.ok(elapsed>=2500,`Dori finished early: ${elapsed}ms`);
    assert.match(await page.locator('#modal').innerText(),/규칙 기반|실제 AI 결과가 아닙니다/);await page.locator('[name="body"]').fill((await page.locator('[name="body"]').inputValue())+'\nReviewed using synthetic evidence.');await submit('draft-form');assert.equal(detail().drafts.length,1);assert.equal(detail().drafts[0].approved_at,null);
    await page.locator('[data-action="approve"]').click();assert.equal(await page.locator('[name="confirmed"]').isChecked(),false);await page.locator('[name="confirmed"]').check();await submit('approve-form');assert.ok(detail().drafts[0].approved_at);
    await screenshot('draft-approved-1280.png');
    await page.locator('[data-action="manual-submit"]').click();await page.locator('[name="note"]').fill('Synthetic manual submission record only');await page.locator('[name="confirmed"]').check();await submit('manual-submit-form');assert.equal(detail().state,'awaiting');assert.equal(JSON.parse(detail().events[0].after_json).externalMessageSent,false);
  });

  await t.test('Refund notice is not cash; actual proof-backed receipt persists across refresh/relogin/another context',async()=>{
    await tab('overview');await page.locator('[data-action="reply"]').click();await page.locator('[name="kind"]').selectOption('refund_notice');await page.locator('[name="body"]').fill('Synthetic notice: refund processed; actual settlement unverified.');await submit('reply-form');assert.equal(detail().summary.cash,0);assert.notEqual(detail().state,'completed');
    await tab('ledger');await page.locator('[data-action="receipt"]').click();await page.locator('[name="amount"]').fill('20.00');await page.locator('[name="transactionRef"]').fill('BROWSER-BANK-001');await page.locator('[name="receivedOn"]').fill('2026-10-09');await page.locator('[name="note"]').fill('Synthetic actual receipt proof reviewed');await page.locator('[name="confirmed"]').check();await submit('receipt-form');assert.equal(detail().summary.cash,2000);assert.equal(detail().state,'partial');assert.equal(detail().ledger.length,1);
    await screenshot('receipt-1280.png');await page.reload();await page.locator('.nav').waitFor();await page.locator('[data-action="open-case"][data-id="'+claimId+'"]').click();await tab('ledger');assert.match(await page.locator('.content').innerText(),/\$20\.00/);
    await page.locator('[data-action="logout"]').click();await page.locator('#login-form').waitFor();await login();await page.locator('[data-action="open-case"][data-id="'+claimId+'"]').click();await tab('ledger');assert.equal(detail().ledger.length,1);assert.match(await page.locator('.content').innerText(),/\$20\.00/);
    const second=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});try{const p=await second.newPage();await p.goto(base);await login('a.agent@relo.test',p);await p.locator('[data-action="open-case"][data-id="'+claimId+'"]').click();await tab('ledger',p);assert.match(await p.locator('.content').innerText(),/\$20\.00/);assert.equal(await p.locator('[data-view="settings"]').count(),0);}finally{await second.close();}
  });

  await t.test('390/760/800/960/1280 menus, search, state filter and dialogs are visible without document overflow',async()=>{
    for(const width of [390,760,800,960,1280]){
      await page.setViewportSize({width,height:900});await page.locator('[data-view="cases"]').click();await page.locator('#search').waitFor();
      for(const selector of ['.nav','[data-view="cases"]','#search','#state-filter','[data-action="new"]'])assert.equal(await page.locator(selector).isVisible(),true,`${width}: ${selector}`);
      await page.locator('#search').fill('BROWSER-SYN-001');assert.equal(await page.locator('[data-action="open-case"]').count(),1);await page.locator('#state-filter').selectOption('partial');assert.equal(await page.locator('[data-action="open-case"]').count(),1);await page.locator('#state-filter').selectOption('completed');assert.equal(await page.locator('[data-action="open-case"]').count(),0);await page.locator('#state-filter').selectOption('');await page.locator('#search').fill('');
      const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert.ok(layout.scroll<=layout.client+1,`${width}: horizontal overflow ${JSON.stringify(layout)}`);measurements.widths.push({width,...layout});await screenshot(`cases-${width}.png`);
      await page.locator('[data-action="new"]').click();await page.locator('#claim-form').waitFor();const box=await page.locator('#modal').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,`${width}: dialog overflow`);await page.keyboard.press('Escape');
    }
    assert.equal(detail().ledger.length,1);
  });

  await t.test('Keyboard tabs/dialog focus, repeated prepare, cancellation ignores late result; reduced motion removes delay',async()=>{
    await page.locator('[data-action="open-case"][data-id="'+claimId+'"]').click();await page.locator('[data-tab="overview"]').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('[data-tab="files"]').getAttribute('aria-selected'),'true');assert.equal(await page.locator('[data-tab="files"]').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('End');assert.equal(await page.locator('[data-tab="history"]').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('[data-tab="overview"]').getAttribute('aria-selected'),'true');
    await tab('draft');let templateRequests=0;await page.route('**/draft-template',async route=>{templateRequests++;await sleep(600);await route.continue();});const before=detail().version;
    await page.locator('[data-action="prepare-draft"]').evaluate(button=>{button.click();button.click();button.click();});await page.locator('.dori-work').waitFor();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#modal')),true);
    await page.locator('[data-action="cancel-preparation"]').click();await page.locator('#modal').waitFor({state:'hidden'});await sleep(2700);assert.equal(await page.locator('#draft-form').count(),0);assert.equal(templateRequests,1);assert.equal(detail().version,before);await page.unroute('**/draft-template');
    await page.emulateMedia({reducedMotion:'reduce'});await page.route('**/draft-template',async route=>{await sleep(200);await route.continue();});const start=Date.now();await page.locator('[data-action="prepare-draft"]').click();await page.locator('.dori-scene').waitFor();assert.equal(await page.locator('.dori-scene').getAttribute('data-motion'),'still');assert.equal(await page.locator('.dori-figure').evaluate(el=>getComputedStyle(el).animationName),'none');await page.locator('#draft-form').waitFor();measurements.dori.reducedMs=Date.now()-start;assert.ok(measurements.dori.reducedMs<2000);assert.equal(detail().version,before);
    for(let i=0;i<15;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#modal')),true);}
    await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});await page.unroute('**/draft-template');
  });

  await t.test('Expired session hides data, offline event cannot reveal it; same-user reauth preserves RAM form and tenant change clears it',async()=>{
    await tab('overview');await page.locator('[data-action="edit"]').click();await page.locator('[name="title"]').fill('Unsaved synthetic RAM draft');app.store.db.prepare('UPDATE sessions SET expires=0').run();await page.locator('#claim-form [type="submit"]').click();await page.locator('#login-form').waitFor();assert.equal(await page.locator('.detail-title').count(),0);
    await page.evaluate(()=>window.dispatchEvent(new Event('offline')));assert.equal(await page.locator('.detail-title').count(),0);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await login();await page.locator('#claim-form').waitFor();assert.equal(await page.locator('[name="title"]').inputValue(),'Unsaved synthetic RAM draft');assert.notEqual(detail().title,'Unsaved synthetic RAM draft');await page.keyboard.press('Escape');
    await page.locator('[data-action="edit"]').click();await page.locator('[name="title"]').fill('Must not cross tenant');app.store.db.prepare('UPDATE sessions SET expires=0').run();await page.locator('#claim-form [type="submit"]').click();await page.locator('#login-form').waitFor();await login('b.admin@relo.test');assert.equal(await page.locator('#claim-form').count(),0);assert.equal(await page.locator('[data-action="open-case"][data-id="'+claimId+'"]').count(),0);assert.equal(await page.evaluate(()=>localStorage.length),0);
    await page.locator('[data-action="logout"]').click();await page.locator('#login-form').waitFor();await login();
  });

  await t.test('Preserved v4 intermediate menu and mobile filters remain usable',async()=>{
    const old=await context.newPage();try{await old.goto(base+'/legacy/');for(const width of [390,760,800,960,1280]){await old.setViewportSize({width,height:900});await old.locator('.workspace').waitFor();if(width<=960)assert.equal(await old.locator('.mobile-nav').isVisible(),true,`v4 ${width}: menu`);if(width<=760)assert.equal(await old.locator('.filter-row').isVisible(),true,`v4 ${width}: filters`);}}finally{await old.close();}
  });
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);measurements.jsErrors=errors;measurements.externalRequests=external;measurements.finalReceiptCents=detail().summary.cash;
  await writeFile(join(artifacts,'browser-evidence.json'),JSON.stringify(measurements,null,2)+'\n');
});
