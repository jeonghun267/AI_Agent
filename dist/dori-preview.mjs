import {createPreparationController,doriView,PREPARATION_DELAY_MS} from './dori.mjs';
const stage=document.querySelector('#dori-preview-stage'),motion=document.querySelector('#preview-motion'),run=document.querySelector('#preview-run'),cancel=document.querySelector('#preview-cancel'),status=document.querySelector('#preview-status'),goal=document.querySelector('#preview-goal');
const reduced=()=>document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
let still=reduced();
const task=createPreparationController();
function draw(){stage.innerHTML=doriView(goal.value,{preview:true,still:still||reduced()});motion.textContent=still||reduced()?'움직임 켜기':'움직임 끄기';motion.setAttribute('aria-pressed',String(still||reduced()));motion.disabled=reduced();}
function resetControls(){run.disabled=false;cancel.disabled=true;goal.disabled=false;motion.disabled=reduced();stage.setAttribute('aria-busy','false');}
motion.addEventListener('click',()=>{still=!still;draw();});
goal.addEventListener('change',()=>{task.cancel();resetControls();draw();});
run.addEventListener('click',()=>task.start({
  delay:still||reduced()?0:PREPARATION_DELAY_MS,
  onStart(){stage.innerHTML=doriView(goal.value,{still:still||reduced()});stage.querySelector('[data-action="cancel-preparation"]').remove();stage.setAttribute('aria-busy','true');run.disabled=true;cancel.disabled=false;goal.disabled=true;motion.disabled=true;status.textContent='문의 틀을 준비하는 짧은 데모 동작을 체험 중입니다.';},
  work(){return true;},
  onReady(){stage.innerHTML=doriView(goal.value,{still:still||reduced(),ready:true});stage.querySelector('[data-action="cancel-preparation"]').remove();status.textContent='데모 준비가 끝났어요. 도리 동작을 보여드린 뒤 완료 화면으로 이동해요.';},
  onSuccess(){resetControls();stage.innerHTML='<div class="dori-preview-result" role="status"><h2>준비 동작이 끝났어요</h2><p>이 미리보기는 실제 초안을 만들거나 사건 상태를 바꾸지 않습니다.</p></div>';status.textContent='서류 정리 동작 체험 완료 · 규칙 기반 데모';},
  onError(){resetControls();draw();status.textContent='미리보기를 마무리하지 못했어요. 다시 체험할 수 있습니다.';},
  onCancel(){resetControls();draw();status.textContent='준비 동작을 취소했어요. 사건 상태는 바뀌지 않았습니다.';}
}));
cancel.addEventListener('click',()=>task.cancel());
document.defaultView?.addEventListener('pagehide',()=>task.cancel());
document.addEventListener('visibilitychange',()=>{if(document.hidden)task.cancel();});
draw();
