import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {createOperationsServer} from '../server.mjs';
import {FIXTURE_PASSWORD} from '../store.mjs';
import {fixturePdf} from '../ai.mjs';
import {amount,hash} from '../domain.mjs';

const key=()=>randomUUID();
async function env(t,options={}){const dir=await mkdtemp(resolve('.relo-test-')),app=createOperationsServer({dataDir:dir,...options}),base=await app.listen(0);t.after(()=>app.close());
  function client(){let cookie='',csrf='';return {async call(path,{method='GET',data,raw,version,key:requestKey,headers={}}={}){const h={Origin:base,...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{'X-CSRF-Token':csrf}),...(data===undefined?{}:{'Content-Type':'application/json'}),...(version===undefined?{}:{'If-Match':String(version)}),...(requestKey?{'Idempotency-Key':requestKey}:{}),...headers};const r=await fetch(base+path,{method,headers:h,body:raw??(data===undefined?undefined:JSON.stringify(data))});const json=(r.headers.get('content-type')||'').includes('application/json'),payload=json?await r.json():Buffer.from(await r.arrayBuffer());if(path==='/api/login'&&r.ok){cookie=r.headers.get('set-cookie').split(';')[0];csrf=payload.csrf;}return {status:r.status,data:payload,headers:r.headers};},async login(email='a.admin@relo.test'){const r=await this.call('/api/login',{method:'POST',data:{email,password:FIXTURE_PASSWORD}});assert.equal(r.status,200);return this;}};}
  return {app,base,dir,client};
}
const input=(title='합성 회수 시험')=>({title,orderRef:'SYN-ORDER-'+key().slice(0,8),kind:'refund',currency:'USD',orderedOn:'2026-10-01',issue:'합성 자료만 사용한 회수 시험입니다.',issueEnglish:'Synthetic test only.',items:[{sku:'TEST-1',name:'합성 품목',orderedQty:10,claimQty:4,unitPrice:'30.00'}],claimedAmount:'120.00',agreedAmount:'120.00'});
function edit(c,patch={}){return {...c,...patch,claimedAmount:patch.claimedAmount??amount(c.claimed),agreedAmount:patch.agreedAmount??(c.agreed===null?'':amount(c.agreed)),items:(patch.items||c.items).map(i=>({...i,unitPrice:typeof i.unitPrice==='number'?amount(i.unitPrice):i.unitPrice}))};}
async function current(c,id){const r=await c.call('/api/claims/'+id);assert.equal(r.status,200);return r.data.claim;}
async function create(c,extra={}){const r=await c.call('/api/claims',{method:'POST',data:{...input(),...extra},key:key()});assert.equal(r.status,201);const claim=r.data.claim;const uploaded=await c.call(`/api/claims/${claim.id}/files`,{method:'POST',raw:fixturePdf(),version:claim.version,key:key(),headers:{'Content-Type':'application/pdf','X-File-Name':'synthetic.pdf'}});assert.equal(uploaded.status,201);return uploaded.data.claim;}
const cash=(c,reference='BANK-'+key())=>({kind:'cash',amount:'20.00',receivedOn:'2026-10-09',proofId:c.files[0].id,transactionRef:reference,note:'합성 은행 내역 확인',confirmed:true});

test('HTTP: session logout, expiry, role and membership revocation, CSRF and host boundaries',async t=>{
  const e=await env(t),a=await e.client().login(),anon=e.client();assert.equal((await anon.call('/api/me')).status,401);
  assert.equal((await anon.call('/api/login',{method:'POST',data:{email:'a.admin@relo.test',password:'wrong'}})).status,401);
  assert.equal((await a.call('/api/claims',{method:'POST',data:input(),key:key(),headers:{Origin:'https://invalid.example'}})).status,403);
  assert.equal((await a.call('/api/claims',{method:'POST',data:input(),key:key(),headers:{'X-CSRF-Token':'wrong'}})).status,403);
  assert.equal((await a.call('/api/claims',{method:'POST',data:input(),key:key(),headers:{'X-CSRF-Token':'é'.repeat(32)}})).status,403);
  const v=await e.client().login('a.viewer@relo.test');e.app.store.db.prepare('UPDATE users SET active=0 WHERE id=?').run('A-viewer');assert.equal((await v.call('/api/me')).status,401);e.app.store.db.prepare('UPDATE users SET active=1 WHERE id=?').run('A-viewer');assert.equal((await v.call('/api/me')).status,401);
  const v2=await e.client().login('a.viewer@relo.test');e.app.store.db.prepare('UPDATE users SET role=? WHERE id=?').run('agent','A-viewer');assert.equal((await v2.call('/api/me')).status,401);e.app.store.db.prepare('UPDATE users SET role=? WHERE id=?').run('viewer','A-viewer');
  const v3=await e.client().login('a.viewer@relo.test');e.app.store.db.prepare('UPDATE users SET tenant=? WHERE id=?').run('B','A-viewer');assert.equal((await v3.call('/api/me')).status,401);e.app.store.db.prepare('UPDATE users SET tenant=? WHERE id=?').run('A','A-viewer');
  assert.equal((await a.call('/api/logout',{method:'POST',data:{}})).status,200);assert.equal((await a.call('/api/me')).status,401);
  const hostStatus=await new Promise((ok,no)=>{const r=httpRequest(e.base+'/api/health',{headers:{Host:'invalid.example'}},res=>{res.resume();ok(res.statusCode);});r.on('error',no);r.end();});assert.equal(hostStatus,403);
  const rate=await Promise.all(Array.from({length:9},()=>anon.call('/api/login',{method:'POST',data:{email:'a.agent@relo.test',password:'wrong'}})));assert.deepEqual(rate.map(r=>r.status).sort(),[401,401,401,401,401,401,401,401,429]);
  const short=await env(t,{sessionMs:80}),shortClient=await short.client().login();await new Promise(r=>setTimeout(r,120));assert.equal((await shortClient.call('/api/me')).status,401);
});

test('HTTP: tenant manipulation, private direct files and server-side role refusal',async t=>{
  const e=await env(t),a=await e.client().login(),b=await e.client().login('b.admin@relo.test'),viewer=await e.client().login('a.viewer@relo.test'),agent=await e.client().login('a.agent@relo.test');
  const c=(await a.call('/api/claims')).data.claims[0],bc=(await b.call('/api/claims')).data.claims[0];assert.notEqual(c.id,bc.id);
  for(const client of [b]){assert.equal((await client.call('/api/claims/'+c.id)).status,404);assert.equal((await client.call('/api/files/'+c.files[0].id)).status,404);assert.equal((await client.call('/api/claims/'+c.id,{method:'PATCH',version:c.version,data:edit(c)})).status,404);}
  assert.equal((await e.client().call('/api/files/'+c.files[0].id)).status,401);const own=await viewer.call('/api/files/'+c.files[0].id);assert.equal(own.status,200);assert.equal(hash(own.data),c.files[0].sha);assert.match(own.headers.get('content-disposition'),/attachment/);
  assert.equal((await viewer.call('/api/claims',{method:'POST',data:input(),key:key()})).status,403);assert.equal((await viewer.call('/api/admin/backups')).status,403);
  assert.equal((await viewer.call(`/api/claims/${c.id}/files`,{method:'POST',raw:fixturePdf(),key:key(),version:c.version,headers:{'Content-Type':'application/pdf'}})).status,403);
  assert.equal((await agent.call('/api/claims/'+c.id,{method:'DELETE',version:c.version,data:{reason:'권한 거부 시험'}})).status,403);
  assert.equal((await agent.call(`/api/claims/${c.id}/approve`,{method:'POST',version:c.version,key:key(),data:{draftId:'invalid',confirmed:true}})).status,403);
  const manipulated=await agent.call('/api/claims',{method:'POST',key:key(),headers:{'X-Tenant-Id':'B'},data:{...input(),tenant:'B'}});assert.equal(manipulated.status,201);assert.equal(manipulated.data.claim.tenant,'A');
  assert.equal((await a.call('/api/claims',{method:'POST',key:key(),data:{...input(),assignedTo:'B-admin'}})).status,422);
  for(const path of ['/.relo-data/relo.sqlite','/operations/store.mjs','/private-backups/fake.json'])assert.equal((await e.client().call(path)).status,404);
});

test('HTTP: durable state across relogin/device, conflicts and file retry/deduplication',async t=>{
  const e=await env(t),a=await e.client().login(),requestKey=key(),data=input();const first=await a.call('/api/claims',{method:'POST',data,key:requestKey});assert.equal(first.status,201);const repeat=await a.call('/api/claims',{method:'POST',data,key:requestKey});assert.equal(repeat.data.claim.id,first.data.claim.id);
  let c=first.data.claim;const version=c.version;const results=await Promise.all([a.call('/api/claims/'+c.id,{method:'PATCH',version,data:edit(c,{title:'수정 A'})}),a.call('/api/claims/'+c.id,{method:'PATCH',version,data:edit(c,{title:'수정 B'})})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);c=await current(a,c.id);
  const uploadKey=key(),options={method:'POST',raw:fixturePdf(),version:c.version,key:uploadKey,headers:{'Content-Type':'application/pdf','X-File-Name':'evidence.pdf'}};const saved=await a.call(`/api/claims/${c.id}/files`,options);assert.equal(saved.status,201);const retry=await a.call(`/api/claims/${c.id}/files`,options);assert.equal(retry.status,201);assert.equal(retry.data.fileId,saved.data.fileId);assert.equal(retry.data.claim.files.length,1);
  const duplicate=await a.call(`/api/claims/${c.id}/files`,{...options,key:key(),version:saved.data.claim.version});assert.equal(duplicate.data.fileId,saved.data.fileId);assert.equal(duplicate.data.claim.version,saved.data.claim.version);
  assert.equal((await a.call(`/api/claims/${c.id}/files`,{...options,key:key(),raw:Buffer.from('not pdf')})).status,422);
  const device=await e.client().login();assert.equal((await current(device,c.id)).files[0].sha,hash(fixturePdf()));await a.call('/api/logout',{method:'POST',data:{}});await a.login();assert.equal((await current(a,c.id)).title,c.title);
});

test('HTTP: receipt transport idempotency differs from cross-user business transaction duplication',async t=>{
  const e=await env(t),a=await e.client().login(),agent=await e.client().login('a.agent@relo.test');let c=await create(a);const data=cash(c,'BANK-ECONOMIC-001'),requestKey=key(),version=c.version;
  const posted=await a.call(`/api/claims/${c.id}/receipts`,{method:'POST',data,key:requestKey,version});assert.equal(posted.status,201);const lostResponseRetry=await a.call(`/api/claims/${c.id}/receipts`,{method:'POST',data,key:requestKey,version});assert.equal(lostResponseRetry.status,201);assert.equal(lostResponseRetry.data.receiptId,posted.data.receiptId);assert.equal(lostResponseRetry.data.claim.ledger.length,1);
  c=await current(a,c.id);for(const client of [a,agent]){const r=await client.call(`/api/claims/${c.id}/receipts`,{method:'POST',data,key:key(),version:c.version});assert.equal(r.status,409);assert.equal(r.data.error,'duplicate_transaction');}
  const otherCase=await create(a);const acrossCase=await agent.call(`/api/claims/${otherCase.id}/receipts`,{method:'POST',data:cash(otherCase,'BANK-ECONOMIC-001'),key:key(),version:otherCase.version});assert.equal(acrossCase.status,409);assert.equal(acrossCase.data.error,'duplicate_transaction');assert.equal((await current(a,otherCase.id)).summary.cash,0);
  const concurrent=await Promise.all([a.call(`/api/claims/${c.id}/receipts`,{method:'POST',data:cash(c,'BANK-SIMULTANEOUS'),key:key(),version:c.version}),agent.call(`/api/claims/${c.id}/receipts`,{method:'POST',data:cash(c,'BANK-SIMULTANEOUS'),key:key(),version:c.version})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);c=await current(a,c.id);assert.equal(c.summary.cash,4000);assert.equal(c.ledger.length,2);
  const manual={...cash(c),transactionRef:'',note:'식별자가 없는 합성 입금을 원장과 대조했습니다.'};assert.equal((await a.call(`/api/claims/${c.id}/receipts`,{method:'POST',data:manual,key:key(),version:c.version})).status,422);
  let r=await a.call(`/api/claims/${c.id}/receipts`,{method:'POST',data:{...manual,amount:'15.00',missingReferenceConfirmed:true,duplicateReviewed:true},key:key(),version:c.version});assert.equal(r.status,201);c=r.data.claim;
  r=await agent.call(`/api/claims/${c.id}/receipts`,{method:'POST',data:{...manual,amount:'15.00',missingReferenceConfirmed:true,duplicateReviewed:true},key:key(),version:c.version});assert.equal(r.status,409);assert.equal(r.data.error,'duplicate_suspected');assert.equal((await current(a,c.id)).summary.cash,5500);
});

test('HTTP: zero settlement and invalid quantities/currency cannot claim recovery',async t=>{
  const e=await env(t),a=await e.client().login();for(const patch of [{currency:'KRW'},{claimedAmount:'1.001'},{items:[{sku:'s',name:'x',orderedQty:1,claimQty:2,unitPrice:'30'}]}])assert.equal((await a.call('/api/claims',{method:'POST',data:{...input(),...patch},key:key()})).status,422);
  const c=await create(a,{agreedAmount:'0.00'});assert.equal((await a.call(`/api/claims/${c.id}/transition`,{method:'POST',version:c.version,data:{action:'close',reason:'확인 없는 종료 시험'}})).status,422);
});

test('HTTP: immutable draft approval, changed facts require reapproval, manual submission only',async t=>{
  const e=await env(t),a=await e.client().login(),agent=await e.client().login('a.agent@relo.test');let c=await create(a);const template=await agent.call(`/api/claims/${c.id}/draft-template`);assert.equal(template.data.mode,'rules');
  let r=await agent.call(`/api/claims/${c.id}/draft`,{method:'POST',version:c.version,key:key(),data:{body:template.data.body}});assert.equal(r.status,201);c=r.data.claim;let draft=c.drafts[0];assert.equal(draft.author,'A-agent');
  assert.equal((await agent.call(`/api/claims/${c.id}/approve`,{method:'POST',version:c.version,key:key(),data:{draftId:draft.id,confirmed:true}})).status,403);
  assert.equal((await a.call(`/api/claims/${c.id}/approve`,{method:'POST',version:c.version,key:key(),data:{draftId:draft.id,confirmed:false}})).status,422);
  r=await a.call(`/api/claims/${c.id}/approve`,{method:'POST',version:c.version,key:key(),data:{draftId:draft.id,confirmed:true}});assert.equal(r.status,200);c=r.data.claim;
  r=await a.call('/api/claims/'+c.id,{method:'PATCH',version:c.version,data:edit(c,{issue:'변경한 합성 사실입니다.'})});assert.equal(r.status,200);c=r.data.claim;assert.equal(c.drafts[0].stale,true);
  assert.equal((await agent.call(`/api/claims/${c.id}/manual-submit`,{method:'POST',version:c.version,key:key(),data:{draftId:draft.id,confirmed:true}})).status,422);
  r=await agent.call(`/api/claims/${c.id}/draft`,{method:'POST',version:c.version,key:key(),data:{body:template.data.body+'\nVerified new facts.'}});c=r.data.claim;draft=c.drafts[0];r=await a.call(`/api/claims/${c.id}/approve`,{method:'POST',version:c.version,key:key(),data:{draftId:draft.id,confirmed:true}});c=r.data.claim;
  r=await agent.call(`/api/claims/${c.id}/manual-submit`,{method:'POST',version:c.version,key:key(),data:{draftId:draft.id,confirmed:true,note:'합성 직접 제출 기록'}});assert.equal(r.status,200);assert.equal(r.data.claim.state,'awaiting');assert.equal(JSON.parse(r.data.claim.events[0].after_json).externalMessageSent,false);
  assert.throws(()=>e.app.store.db.prepare('UPDATE drafts SET body=? WHERE id=?').run('bad',draft.id),/immutable/);
});

test('HTTP: completed backup restore uses active ledger and preserves reversal plus later deletion',async t=>{
  const e=await env(t),a=await e.client().login(),b=await e.client().login('b.admin@relo.test');let c=await create(a);let r=await a.call(`/api/claims/${c.id}/receipts`,{method:'POST',version:c.version,key:key(),data:{...cash(c,'BANK-FULL'),amount:'120.00'}});assert.equal(r.status,201);c=r.data.claim;
  r=await a.call(`/api/claims/${c.id}/transition`,{method:'POST',version:c.version,data:{action:'close',reason:'전체 실입금 확인'}});assert.equal(r.status,200);c=r.data.claim;const original=c.ledger[0].id,bid=(await a.call('/api/admin/backups',{method:'POST',data:{}})).data.id;
  r=await a.call(`/api/admin/backups/${bid}/restore`,{method:'POST',data:{confirmed:true}});assert.equal(r.status,200);c=await current(a,c.id);assert.equal(c.state,'completed');assert.equal(c.summary.cash,12000);
  c=(await a.call(`/api/claims/${c.id}/transition`,{method:'POST',version:c.version,data:{action:'reopen',reason:'합성 입금 정정 확인'}})).data.claim;
  r=await a.call(`/api/claims/${c.id}/receipts`,{method:'POST',version:c.version,key:key(),data:{kind:'reversal',reverses:original,receivedOn:'2026-10-09',proofId:c.files[0].id,confirmed:true,note:'합성 입금 취소 증빙 확인'}});assert.equal(r.status,201);c=r.data.claim;assert.equal(c.summary.cash,0);
  assert.equal((await a.call(`/api/admin/backups/${bid}/restore`,{method:'POST',data:{confirmed:true}})).status,200);c=await current(a,c.id);assert.equal(c.state,'negotiating');assert.equal(c.summary.cash,0);assert.equal(c.ledger.length,2);
  const fid=c.files[0].id;assert.equal((await a.call('/api/claims/'+c.id,{method:'DELETE',version:c.version,data:{reason:'합성 삭제 기록'}})).status,200);assert.equal((await a.call('/api/files/'+fid)).status,404);
  assert.equal((await a.call(`/api/admin/backups/${bid}/restore`,{method:'POST',data:{confirmed:true}})).status,200);assert.equal((await a.call('/api/claims/'+c.id)).status,404);
  const deleted=(await a.call('/api/claims?deleted=1')).data.claims.find(x=>x.id===c.id);assert.ok(deleted);r=await a.call(`/api/claims/${c.id}/restore`,{method:'POST',version:deleted.version,data:{confirmed:true}});assert.equal(r.status,200);assert.equal((await a.call('/api/files/'+fid)).status,200);
  assert.equal((await b.call(`/api/admin/backups/${bid}/restore`,{method:'POST',data:{confirmed:true}})).status,404);assert.equal((await b.call('/api/claims')).data.claims.length,1);
  assert.equal((await a.call('/api/admin/audit-check')).data.valid,true);
});

test('Recovery: isolated new DB imports no credentials, verifies bytes/ledger/permissions and reapplies post-backup deletion',async t=>{
  const source=await env(t),a=await source.client().login();let c=await create(a);const bid=(await a.call('/api/admin/backups',{method:'POST',data:{}})).data.id;
  c=(await a.call(`/api/claims/${c.id}/receipts`,{method:'POST',version:c.version,key:key(),data:cash(c,'BANK-POST-BACKUP')})).data.claim;
  const fid=c.files[0].id;await a.call('/api/claims/'+c.id,{method:'DELETE',version:c.version,data:{reason:'백업 이후 삭제 요청'}});
  const bundle=source.app.store.exportRecovery(source.app.store.user('A-admin'),bid),artifact=join(source.dir,'recovery-synthetic.json');await writeFile(artifact,JSON.stringify(bundle));const loaded=JSON.parse(await readFile(artifact,'utf8'));assert.equal(loaded.data.users,undefined);assert.equal(loaded.data.sessions,undefined);
  const target=await env(t,{seed:'identities'});const restored=target.app.store.importRecovery(target.app.store.user('A-admin'),loaded);assert.equal(restored.deletionsReapplied,1);
  const ra=await target.client().login(),rb=await target.client().login('b.admin@relo.test');assert.equal((await ra.call('/api/claims/'+c.id)).status,404);assert.equal((await ra.call('/api/files/'+fid)).status,404);assert.equal((await rb.call('/api/files/'+fid)).status,404);
  const archived=(await ra.call('/api/claims?deleted=1')).data.claims.find(x=>x.id===c.id);assert.equal(archived.summary.cash,2000);assert.equal(archived.ledger[0].transaction_ref,'BANK-POST-BACKUP');assert.equal(archived.files[0].sha,hash(fixturePdf()));
  const restoredClaim=await ra.call(`/api/claims/${c.id}/restore`,{method:'POST',version:archived.version,data:{confirmed:true}});assert.equal(restoredClaim.status,200);assert.equal(hash((await ra.call('/api/files/'+fid)).data),hash(fixturePdf()));assert.equal((await rb.call('/api/claims')).data.claims.length,0);assert.equal((await ra.call('/api/admin/audit-check')).data.valid,true);
  const tampered=structuredClone(bundle);tampered.data.files[0].bytes='invalid';const isolated=await env(t,{seed:'identities'});assert.throws(()=>isolated.app.store.importRecovery(isolated.app.store.user('A-admin'),tampered),/무결성/);assert.equal(isolated.app.store.list(isolated.app.store.user('A-admin')).length,0);
});
