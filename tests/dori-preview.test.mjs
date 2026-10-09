import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('Standalone preview uses the same honest display, immediate cancellation and reduced motion',async t=>{
  const dom=new JSDOM(await readFile(new URL('../dist/dori-preview.html',import.meta.url),'utf8'),{url:'http://localhost:4173/dori-preview.html',pretendToBeVisual:true});
  const w=dom.window,doc=w.document;let reduce=false;w.matchMedia=()=>({matches:reduce});
  Object.defineProperty(globalThis,'document',{value:doc,configurable:true});
  await import('../dist/dori-preview.mjs?display-test');
  const one=q=>{const el=doc.querySelector(q);assert.ok(el,q);return el;},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  await t.test('A fast demo result stays visible with completed wording for the minimum interval',async()=>{
    const started=performance.now();one('#preview-run').click();await wait(25);
    assert.equal(one('.dori-work').dataset.ready,'true');assert.match(one('#preview-status').textContent,/준비가 끝났어요/);
    assert.equal(one('#preview-run').disabled,true);assert.equal(one('#preview-motion').disabled,true);
    await wait(100);assert.ok(doc.querySelector('.dori-work'));
    for(let i=0;i<130&&doc.querySelector('.dori-work');i++)await wait(25);
    assert.ok(one('.dori-preview-result'));assert.ok(performance.now()-started>=2500);assert.equal(one('#preview-run').disabled,false);assert.equal(one('#preview-cancel').disabled,true);
  });
  await t.test('Cancellation clears a ready display immediately; reduced motion has no artificial wait',async()=>{
    one('#preview-run').click();await wait(25);assert.equal(one('.dori-work').dataset.ready,'true');
    one('#preview-cancel').click();assert.equal(doc.querySelector('.dori-work'),null);assert.equal(one('#preview-run').disabled,false);assert.equal(one('#preview-motion').disabled,false);assert.equal(one('#dori-preview-stage').getAttribute('aria-busy'),'false');
    reduce=true;one('#preview-run').click();assert.equal(one('.dori-work .dori-scene').dataset.motion,'still');await wait(10);assert.ok(one('.dori-preview-result'));assert.equal(one('#preview-motion').disabled,true);
  });
  dom.window.close();
});
