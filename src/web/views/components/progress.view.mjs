import {html, raw} from '../../core/html.mjs';
import {money} from '../../core/format.mjs';
import {selectProgress, selectRecovery} from '../../viewmodels/claim-progress.mjs';

const CHECK = raw('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 8.5 2.5 2.5L12 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');

// Six-step progress line under the claim title (DESIGN.md §7).
export function progressSteps(claim) {
  const {steps, flag} = selectProgress(claim);
  return html`<div class="steps-wrap">
    <ol class="steps${flag === 'waived' ? ' is-stopped' : ''}" aria-label="진행 단계">
      ${steps.map((step, index) => html`<li class="step ${step.status}${step.status === 'current' && flag ? ` is-${flag}` : ''}" ${step.status === 'current' ? html`aria-current="step"` : ''}>
        <span class="step-dot">${step.status === 'done' ? CHECK : index + 1}</span>
        <span class="step-label">${step.label}${step.status === 'current' && flag === 'disputed' ? html`<span class="step-flag"> (분쟁)</span>` : ''}</span>
      </li>`)}
    </ol>
    ${flag === 'waived' ? html`<p class="steps-note">포기로 기록된 건이에요. 다시 진행하려면 사유를 남기고 재개하세요.</p>` : ''}
  </div>`;
}

function recoveryText(recovery) {
  if (recovery.unit === 'money') return html`<strong>${money(recovery.got, recovery.currency)}</strong> 받음 / ${money(recovery.target, recovery.currency)}`;
  if (recovery.unit === 'count') return html`교환품 <strong>${recovery.got}</strong> / ${recovery.target}개 받음`;
  return recovery.got ? html`<strong>수리 결과 확인함</strong>` : html`수리 결과 기다리는 중`;
}

// Short form for table cells: "€20.00", "1/2개", "수리 확인".
export function recoveryShort(claim) {
  const recovery = selectRecovery(claim);
  if (recovery.unit === 'money') return money(recovery.got, recovery.currency);
  if (recovery.unit === 'count') return `${recovery.got}/${recovery.target}개`;
  return recovery.got ? '수리 확인' : '대기 중';
}

// Recovery meter: what actually came back against what was asked for.
// compact = a bare bar for table cells (the amount is printed next to it).
export function recoveryMeter(claim, {compact = false} = {}) {
  const recovery = selectRecovery(claim);
  const label = `회수율 ${recovery.percent}%`;
  if (compact) return html`<progress class="meter-bar compact" max="100" value="${recovery.percent}" aria-label="${label}"></progress>`;
  return html`<div class="meter">
    <div class="meter-head"><span>${recoveryText(recovery)}</span><span class="meter-percent">${recovery.percent}%</span></div>
    <progress class="meter-bar" max="100" value="${recovery.percent}" aria-label="${label}"></progress>
    ${recovery.basis ? html`<small>${recovery.basis}</small>` : ''}
  </div>`;
}
