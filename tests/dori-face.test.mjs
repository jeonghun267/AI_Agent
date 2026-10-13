import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {doriSvg,doriView} from '../dist/dori.mjs';

const svgDoc=()=>new JSDOM(doriSvg(),{contentType:'image/svg+xml'}).window.document;
const face={left:87,top:83,right:136,bottom:113}; // Both eyes and the complete beak, with clearance.
const overlapsFace=points=>Math.min(...points.map(p=>p.x))<=face.right&&Math.max(...points.map(p=>p.x))>=face.left&&Math.min(...points.map(p=>p.y))<=face.bottom&&Math.max(...points.map(p=>p.y))>=face.top;
const poseFrom=source=>{const match=source.match(/translate\(([-.\d]+)(?:px)?,([-.\d]+)(?:px)?\) rotate\(([-.\d]+)(?:deg)?\)/);assert.ok(match,source);return match.slice(1).map(Number);};
function corners(rect,[tx,ty,angle]){const r=angle*Math.PI/180;return [[rect.x,rect.y],[rect.x+rect.w,rect.y],[rect.x+rect.w,rect.y+rect.h],[rect.x,rect.y+rect.h]].map(([x,y])=>({x:166+tx+(x-166)*Math.cos(r)-(y-148)*Math.sin(r),y:148+ty+(x-166)*Math.sin(r)+(y-148)*Math.cos(r)}));}

test('The strap stays below the face and facial features paint above the strap',()=>{
  const doc=svgDoc(),strap=doc.querySelector('.dori-strap'),visibleFace=doc.querySelector('.dori-face');
  assert.ok(strap&&visibleFace);
  assert.equal(strap.nextElementSibling,visibleFace);
  assert.ok(visibleFace.querySelector('.dori-eyes'));assert.ok(visibleFace.querySelector('.dori-beak'));
  for(const path of strap.querySelectorAll('path')){
    const values=path.getAttribute('d').match(/[-.\d]+/g).map(Number);
    const y0=values[1],y1=path.getAttribute('d').startsWith('m')?y0+values[3]:values[3];
    const radius=Number(path.getAttribute('stroke-width'))/2;
    assert.ok(Math.min(y0,y1)-radius>face.bottom,'The complete strap stroke must stay below eyes and beak');
  }
  const bag=doc.querySelector('.dori-bag rect');
  assert.ok(Number(bag.getAttribute('x'))>=140&&Number(bag.getAttribute('y'))>=140,'Bag stays at lower side of body');
});

test('Animated SVG groups have one explicit viewport transform origin and no nested SVG transform',async()=>{
  const doc=svgDoc(),css=await readFile(new URL('../dist/dori.css',import.meta.url),'utf8');
  assert.match(css,/\.dori-figure,\.dori-wing,\.dori-bag-flap,\.dori-document\{transform-box:view-box\}/);
  for(const name of ['figure','wing','bag-flap','document','bag','strap','face'])assert.equal(doc.querySelector(`.dori-${name}`).getAttribute('transform'),null);
  assert.doesNotMatch(css,/\.dori-bag\s*\{[^}]*\b(?:animation|transform)\s*:/);
  assert.doesNotMatch(css,/\.dori-strap\s*\{[^}]*\b(?:animation|transform)\s*:/);
});

test('The document clears both eyes and beak throughout the sorting path and reduced-motion pose',async()=>{
  const doc=svgDoc(),css=await readFile(new URL('../dist/dori.css',import.meta.url),'utf8');
  const element=doc.querySelector('.dori-document rect'),pad=Number(element.getAttribute('stroke-width'))/2;
  const rect={x:Number(element.getAttribute('x'))-pad,y:Number(element.getAttribute('y'))-pad,w:Number(element.getAttribute('width'))+pad*2,h:Number(element.getAttribute('height'))+pad*2};
  const rules=css.match(/@keyframes dori-sort\{(.*)\}\r?\n/)[1],frames=[];
  for(const match of rules.matchAll(/([\d%,]+)\{([^}]+)\}/g)){const pose=poseFrom(match[2]);for(const percentage of match[1].split(','))frames.push({time:parseFloat(percentage),pose});}
  frames.sort((a,b)=>a.time-b.time);assert.ok(frames.length>=7);
  for(let i=1;i<frames.length;i++)for(let sample=0;sample<=100;sample++){
    const fraction=sample/100,pose=frames[i-1].pose.map((value,j)=>value+(frames[i].pose[j]-value)*fraction);
    assert.equal(overlapsFace(corners(rect,pose)),false,`Document intersects face between ${frames[i-1].time}% and ${frames[i].time}%`);
  }
  const still=css.match(/\.is-still \.dori-document\{([^}]+)\}/)[1];
  const reduced=css.match(/@media\(prefers-reduced-motion:reduce\).*\.is-sorting \.dori-document\{([^}]+)\}/)[1];
  assert.equal(overlapsFace(corners(rect,poseFrom(still))),false);assert.equal(overlapsFace(corners(rect,poseFrom(reduced))),false);
});

test('Static art, all preview goals, and loading views share the corrected illustration',async()=>{
  assert.equal(await readFile(new URL('../dist/dori.svg',import.meta.url),'utf8'),doriSvg());
  for(const goal of ['return','exchange','repair'])for(const preview of [false,true])for(const still of [false,true]){
    const doc=new JSDOM(doriView(goal,{preview,still})).window.document;
    assert.equal(doc.querySelector('.dori-strap path').getAttribute('d'),'M76 125 157 164');
    assert.ok(doc.querySelector('.dori-face .dori-eyes'));assert.ok(doc.querySelector('.dori-face .dori-beak'));
  }
});
