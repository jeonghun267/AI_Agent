import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createPreparationController,PREPARATION_DELAY_MS,doriView,doriMarkSvg} from '../dist/dori.mjs';

function clock(){let now=0,id=0;const timers=new Map();const task=createPreparationController({schedule:(fn,delay)=>{timers.set(++id,{fn,time:now+delay});return id;},unschedule:id=>timers.delete(id)});return {task,timers,get now(){return now;},advance(ms){const end=now+ms;for(;;){const due=[...timers.entries()].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time||a[0]-b[0])[0];if(!due)break;timers.delete(due[0]);now=due[1].time;due[1].fn();}now=end;}};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('Fast completion is honestly ready but remains visible until the 2500ms minimum',()=>{
  const c=clock();let ready=0,success=0;assert.equal(PREPARATION_DELAY_MS,2500);
  c.task.start({work:()=>42,onReady:value=>{assert.equal(value,42);ready++;},onSuccess:value=>{assert.equal(value,42);success++;}});
  c.advance(0);assert.equal(ready,1);assert.equal(success,0);assert.equal(c.task.running,true);
  assert.equal(c.task.start({work:()=>assert.fail('Duplicate work')}),false);
  c.advance(2499);assert.equal(success,0);c.advance(1);assert.equal(success,1);assert.equal(c.task.running,false);assert.equal(c.timers.size,0);
});

test('Work slower than the minimum stays visible until the actual async result',async()=>{
  const c=clock();let resolve,ready=0,success=0;
  c.task.start({work:()=>new Promise(done=>resolve=done),onReady:()=>ready++,onSuccess:()=>success++});
  c.advance(2500);assert.equal(c.task.running,true);assert.equal(ready,0);assert.equal(success,0);
  c.advance(1000);resolve('done');await flush();assert.equal(success,1);assert.equal(ready,1);assert.equal(c.task.running,false);assert.equal(c.timers.size,0);
});

test('Cancel during the finished-work display is immediate and old callbacks cannot apply it',()=>{
  const c=clock();let success=0,cancels=0;c.task.start({work:()=>true,onSuccess:()=>success++,onCancel:()=>cancels++});
  c.advance(0);const late=[...c.timers.values()][0].fn;
  assert.equal(c.task.cancel('navigation'),true);assert.equal(c.task.running,false);assert.equal(c.timers.size,0);assert.equal(cancels,1);
  c.task.start({work:()=>true,onSuccess:()=>success++});late();assert.equal(success,0);c.advance(2500);assert.equal(success,1);
});

test('Errors and cancellation of pending asynchronous work do not wait or revive the loading state',async()=>{
  const c=clock();let errors=0,success=0,resolve;
  c.task.start({work:()=>{throw Error('failed');},onError:()=>errors++});c.advance(0);assert.equal(errors,1);assert.equal(c.task.running,false);assert.equal(c.timers.size,0);
  c.task.start({work:()=>new Promise(done=>resolve=done),onSuccess:()=>success++});c.advance(0);c.task.cancel();resolve(true);await flush();c.advance(3000);assert.equal(success,0);assert.equal(c.task.running,false);
});

test('Reduced motion completes without a decorative delay and ready text explains the display',()=>{
  const c=clock();let success=0;c.task.start({delay:0,work:()=>true,onSuccess:()=>success++});c.advance(0);assert.equal(success,1);assert.equal(c.task.running,false);
  const ready=new JSDOM(doriView('return',{ready:true})).window.document;
  assert.equal(ready.querySelector('.dori-work').dataset.ready,'true');assert.match(ready.body.textContent,/문의 틀이 준비됐어요/);assert.match(ready.body.textContent,/동작을 잠깐 보여드린 뒤/);assert.doesNotMatch(ready.body.textContent,/처리 중|서버|분석 중/);
});

test('Brand, favicon and touch icon use the Dori face while the current service name stays unchanged',async()=>{
  const [app,preview,index,mark,favicon,legacy,touch]=await Promise.all(['dist/app.mjs','dist/dori-preview.html','dist/index.html','dist/dori-mark.svg','dist/dori-favicon.svg','dist/favicon.svg','dist/dori-touch-icon.png'].map(file=>readFile(new URL('../'+file,import.meta.url))));
  for(const art of [mark,favicon,legacy])assert.equal(art.toString(),doriMarkSvg());
  assert.equal((app.toString().match(/src="\.\/dori-mark.svg"/g)||[]).length,2);assert.equal((preview.toString().match(/src="\.\/dori-mark.svg"/g)||[]).length,1);
  for(const html of [preview.toString(),index.toString()]){const doc=new JSDOM(html).window.document;assert.equal(doc.querySelector('link[rel="icon"]').getAttribute('href'),'./dori-favicon.svg');assert.equal(doc.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'),'./dori-touch-icon.png');assert.match(doc.title,/리턴데스크/);}
  assert.doesNotMatch(app.toString()+preview.toString(),/<span class="brand-mark">R<\/span>/);assert.match(app.toString(),/리턴데스크/);
  assert.equal(touch.readUInt32BE(16),192);assert.equal(touch.readUInt32BE(20),192);
  const svg=new JSDOM(mark.toString(),{contentType:'image/svg+xml'}).window.document;assert.equal(svg.querySelector('svg').getAttribute('viewBox'),'0 0 64 64');assert.equal(svg.querySelectorAll('ellipse[fill="#203a4b"]').length,2);
});
