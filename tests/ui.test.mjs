import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {STORE_KEY,createCase,dateOnly} from '../dist/core.mjs';

test('DOM 통합: 접수 → 자료 확인 → 초안 수정·재검토 → 제출 기록 → 자료 요청 → 환불 통지 → 사용자 확인 종료', async t => {
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost:4173/'});
  const w=dom.window, doc=w.document;
  Object.defineProperties(globalThis,{document:{value:doc,configurable:true},localStorage:{value:w.localStorage,configurable:true},navigator:{value:w.navigator,configurable:true},FormData:{value:w.FormData,configurable:true}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  await import('../dist/app.mjs');
  const one=q=>{const el=doc.querySelector(q);assert.ok(el,`Element missing: ${q}`);return el;};
  const click=q=>one(q).click();
  const change=(q,value)=>{const el=one(q);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const fill=(q,value)=>one(q).value=value;
  const submit=q=>one(q).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const state=()=>JSON.parse(w.localStorage.getItem(STORE_KEY)).cases[0];
  const waitForPreparation=async()=>{for(let i=0;i<140;i++){if(!doc.querySelector('.dori-work'))return;await new Promise(resolve=>setTimeout(resolve,25));}assert.fail('Preparation did not finish');};

  await t.test('실제 화면 코드의 접수 폼이 사건을 만들고 사용자 문자열을 안전하게 표시',()=>{
    assert.equal(doc.querySelectorAll('.case-card').length,3);
    assert.match(one('.demo-banner').textContent,/AI 호출·외부 발송은 하지 않습니다/);
    assert.match(one('.next-step h3').textContent,/제품 일련번호를/);
    click('[data-action="new"]');
    fill('#title','QA 검증용 상품');fill('#issue','<img src=x onerror="alert(1)"> 테스트 문제');
    fill('#channel','direct');fill('#vendor','apple');fill('#region','US');fill('#issueType','changed');
    submit('#new-case-form');
    assert.equal(JSON.parse(w.localStorage.getItem(STORE_KEY)).cases.length,4);
    assert.match(one('.case-title-row').textContent,/QA 검증용 상품/);
    assert.equal(doc.querySelectorAll('.case-content img').length,0);
    assert.equal(one('#modal').open,false);
  });
  await t.test('자료 체크·영문 틀 작성·편집 후 이전 승인이 무효화',async()=>{
    change('input[data-evidence="order"]',true);
    click('[data-action="generate"]');
    assert.equal(one('#case-panel').getAttribute('aria-busy'),'true');
    assert.match(one('.dori-work').textContent,/반품 문의 서류/);
    await waitForPreparation();
    assert.equal(one('#case-panel').getAttribute('aria-busy'),'false');
    assert.equal(state().phase,'review');
    assert.match(one('#draft-editor').value,/in Korean/);
    change('#review-check',true);assert.equal(state().reviewed,true);
    const editor=one('#draft-editor');editor.value+='\nPlease confirm the next steps.';editor.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(state().reviewed,false);
    assert.equal(one('#copy-button').disabled,true);
    assert.equal(one('#submitted-button').disabled,true);
    change('#review-check',true);click('[data-action="submission"]');
    one('#confirmation-form [name="confirmed"]').checked=true;submit('#confirmation-form');
    assert.equal(state().phase,'awaiting');
    assert.match(one('.timeline').textContent,/앱에서 발송하지 않음/);
  });
  await t.test('추가 자료 요청으로 다시 보완하고 중복 답변을 거부',()=>{
    click('[data-tab="replies"]');click('[data-action="reply"]');
    fill('#reply-text','Please provide a photo of the serial number.');
    change('#reply-type','evidence');one('[name="evidenceIds"][value="serial"]').checked=true;
    submit('#reply-form');
    assert.equal(state().phase,'preparing');assert.equal(state().draftStale,true);
    assert.equal(state().evidence.find(e=>e.id==='serial').required,true);
    click('[data-action="reply"]');fill('#reply-text','Please provide a photo of the serial number.');
    one('[name="evidenceIds"][value="serial"]').checked=true;submit('#reply-form');
    assert.match(one('.form-error').textContent,/이미 기록/);
    assert.equal(state().replies.length,1);click('[data-action="close"]');
    click('[data-tab="evidence"]');click('[data-action="generate"]');
    assert.match(one('#toast').textContent,/필수 자료/);
    assert.equal(state().phase,'preparing');
  });
  await t.test('환불 처리 안내는 미완료이며 최종 확인 체크가 있어야 종료',()=>{
    click('[data-tab="replies"]');click('[data-action="reply"]');
    fill('#reply-text','Your refund has been processed.');change('#reply-type','refund');submit('#reply-form');
    assert.equal(state().phase,'refundPending');
    assert.match(one('.result-box').textContent,/실제 입금은 미확인/);
    click('[data-action="complete"]');submit('#confirmation-form');
    assert.equal(state().phase,'refundPending');assert.match(one('.form-error').textContent,/직접 확인/);
    one('#confirmation-form [name="confirmed"]').checked=true;submit('#confirmation-form');
    assert.equal(state().phase,'completed');assert.match(one('.timeline').textContent,/실제 입금/);
    assert.equal(doc.querySelector('[data-action="stop"]'),null);
  });
  await t.test('키보드 탭 이동과 기한 없는 사건 대기 표시',()=>{
    const current=one('#tab-history');current.focus();current.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    assert.equal(one('#tab-evidence').getAttribute('aria-selected'),'true');
    assert.equal(doc.activeElement.id,'tab-evidence');
    click('[data-action="tasks"]');assert.match(one('.tasks-grid').textContent,/확인된 기한 없음/);
  });
  dom.window.close();
});

test('도리 DOM: 미리보기·취소·사건 이동·페이지 이탈·AS·모션 줄이기',async t=>{
  const c=createCase({vendor:'anker',title:'AS 동작 검증용',goal:'repair',received:dateOnly(),channel:'direct',region:'KR',issueType:'defective',issue:'가상 증상'});
  c.evidence.forEach(e=>e.ready=true);
  const dom=new JSDOM(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),{url:'http://localhost:4173/',pretendToBeVisual:true});
  const w=dom.window,doc=w.document;let reduce=false;
  w.matchMedia=()=>({matches:reduce});
  Object.defineProperties(globalThis,{document:{value:doc,configurable:true},localStorage:{value:w.localStorage,configurable:true},navigator:{value:w.navigator,configurable:true},FormData:{value:w.FormData,configurable:true}});
  w.localStorage.setItem(STORE_KEY,JSON.stringify({version:1,cases:[c]}));
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  await import('../dist/app.mjs?dori-ui');
  const one=q=>{const el=doc.querySelector(q);assert.ok(el,`Element missing: ${q}`);return el;};
  const click=q=>one(q).click(),state=()=>JSON.parse(w.localStorage.getItem(STORE_KEY)).cases[0];
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  await t.test('별도 SVG 캐릭터 미리보기와 정지 옵션은 사건을 변경하지 않는다',()=>{
    click('[data-action="dori-preview"]');assert.equal(one('#modal').open,true);
    assert.match(one('.dori-character').getAttribute('aria-label'),/크로스백.*도리/);
    assert.ok(one('.dori-bag'));assert.ok(one('.dori-strap'));assert.ok(one('.dori-document'));
    click('[data-action="dori-motion"]');assert.equal(one('#dori-modal-stage .dori-scene').dataset.motion,'still');
    assert.equal(state().events.length,1);click('[data-action="close"]');assert.equal(doc.querySelector('#modal .dori-character'),null);
  });
  await t.test('AS 준비 중 취소하면 타이머·로딩·늦은 상태 변경을 정리',async()=>{
    click('[data-action="generate"]');assert.match(one('.dori-work').textContent,/AS 문의 서류/);
    await delay(25);assert.equal(one('.dori-work').dataset.ready,'true');assert.match(one('.dori-work').textContent,/문의 틀이 준비됐어요/);
    assert.equal(state().draft,'');click('[data-action="cancel-preparation"]');
    assert.equal(doc.querySelector('#draft-editor'),null);
    assert.equal(doc.querySelector('.dori-work'),null);assert.equal(one('#case-panel').getAttribute('aria-busy'),'false');
    await delay(550);assert.equal(state().phase,'preparing');assert.equal(state().draft,'');assert.equal(state().events.length,1);
  });
  await t.test('화면 이동 후 이전 준비 작업이 새 화면이나 사건을 갱신하지 않는다',async()=>{
    click('[data-action="generate"]');click('[data-action="tasks"]');
    assert.ok(one('.tasks-grid'));assert.equal(doc.querySelector('.dori-work'),null);
    await delay(550);assert.equal(state().phase,'preparing');assert.equal(state().events.length,1);click('[data-action="home"]');
  });
  await t.test('키보드 탭 이동과 페이지 이탈도 준비를 취소한다',()=>{
    click('[data-action="generate"]');one('#tab-draft').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    assert.equal(one('#tab-replies').getAttribute('aria-selected'),'true');assert.equal(doc.querySelector('.dori-work'),null);
    click('[data-action="tab"][data-tab="draft"]');click('[data-action="generate"]');w.dispatchEvent(new w.Event('pagehide'));
    assert.equal(doc.querySelector('.dori-work'),null);assert.equal(state().draft,'');
  });
  await t.test('모션 줄이기는 정적 도리와 지연 없는 준비 완료로 반영',async()=>{
    reduce=true;click('[data-action="generate"]');assert.equal(one('.dori-work .dori-scene').dataset.motion,'still');
    await delay(0);assert.equal(doc.querySelector('.dori-work'),null);assert.equal(state().phase,'review');
    assert.ok(one('#draft-editor'));assert.equal(one('#case-panel').getAttribute('aria-busy'),'false');
  });
  dom.window.close();
});
