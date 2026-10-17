import {html, raw} from '../../core/html.mjs';
import {money} from '../../core/format.mjs';
import {selectProgress, selectRecovery, stepIndex, PROGRESS_STEPS} from '../../viewmodels/claim-progress.mjs';

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

// Compact progress for cards: six short segments and the current step's name.
export function miniSteps(claim) {
  const index = stepIndex(claim);
  const label = index < 0 ? '포기' : index >= PROGRESS_STEPS.length ? '종료' : PROGRESS_STEPS[index].label;
  const flag = claim.state === 'disputed' ? ' is-disputed' : index < 0 ? ' is-stopped' : '';
  const position = index < 0 ? '' : `${Math.min(index + 1, PROGRESS_STEPS.length)}/${PROGRESS_STEPS.length}`;
  return html`<div class="mini-steps${flag}">
    <ol aria-hidden="true">${PROGRESS_STEPS.map((_, n) => html`<li class="${n < index ? 'done' : n === index ? 'current' : ''}"></li>`)}</ol>
    <span class="mini-steps-label"><span class="visually-hidden">진행 단계 </span>${label}${claim.state === 'disputed' ? ' (분쟁)' : ''}${position ? html` <small>${position}</small>` : ''}</span>
  </div>`;
}

function recoveryText(recovery) {
  if (recovery.unit === 'money') return html`<strong>${money(recovery.got, recovery.currency)}</strong> 받음 / ${money(recovery.target, recovery.currency)}`;
  if (recovery.unit === 'count') return html`교환품 <strong>${recovery.got}</strong> / ${recovery.target}개 받음`;
  return recovery.got ? html`<strong>수리 결과 확인함</strong>` : html`수리 결과 기다리는 중`;
}

// Short form for cards: "€20.00", "1/2개", "수리 확인".
export function recoveryShort(claim) {
  const recovery = selectRecovery(claim);
  if (recovery.unit === 'money') return money(recovery.got, recovery.currency);
  if (recovery.unit === 'count') return `${recovery.got}/${recovery.target}개`;
  return recovery.got ? '수리 확인' : '대기 중';
}

// Recovery meter: what actually came back against what was asked for.
// compact = a bare bar with the percentage, for cards.
export function recoveryMeter(claim, {compact = false} = {}) {
  const recovery = selectRecovery(claim);
  const label = `회수율 ${recovery.percent}%`;
  if (compact) {
    return html`<div class="meter-compact">
      <progress class="meter-bar compact" max="100" value="${recovery.percent}" aria-label="${label}"></progress>
      <span class="meter-percent">${recovery.percent}%</span>
    </div>`;
  }
  return html`<div class="meter">
    <div class="meter-head"><span>${recoveryText(recovery)}</span><span class="meter-percent">${recovery.percent}%</span></div>
    <progress class="meter-bar" max="100" value="${recovery.percent}" aria-label="${label}"></progress>
    ${recovery.basis ? html`<small>${recovery.basis}</small>` : ''}
  </div>`;
}

// The claim's money at a glance (DESIGN.md §1: money comes first). Refunds
// lead with what is still owed; exchanges and repairs with what is still missing.
export function moneyCard(claim) {
  const cur = claim.currency;
  const {summary} = claim;
  let head;
  let rows;
  if (claim.kind === 'refund') {
    const settled = summary.remaining === 0 && summary.cash > 0;
    head = settled
      ? html`<span>돌려받은 금액</span><strong class="money-big positive">${money(summary.cash, cur)}</strong>`
      : html`<span>아직 못 받은 금액</span><strong class="money-big">${money(summary.remaining, cur)}</strong>`;
    rows = html`
      <div><dt>청구액</dt><dd>${money(claim.claimed, cur)}</dd></div>
      <div><dt>합의액</dt><dd>${claim.agreed === null ? html`<span class="muted">아직 합의 전</span>` : money(claim.agreed, cur)}</dd></div>
      <div><dt>실제 회수액</dt><dd class="positive">${money(summary.cash, cur)}</dd></div>`;
  } else if (claim.kind === 'exchange') {
    const missing = Math.max(0, summary.requestedQty - summary.goods);
    head = html`<span>${missing ? '아직 못 받은 교환품' : '교환품'}</span><strong class="money-big${missing ? '' : ' positive'}">${missing ? `${missing}개` : '모두 받음'}</strong>`;
    rows = html`
      <div><dt>요청 수량</dt><dd>${summary.requestedQty}개</dd></div>
      <div><dt>받은 수량</dt><dd class="positive">${summary.goods}개</dd></div>
      <div><dt>청구액</dt><dd>${money(claim.claimed, cur)}</dd></div>`;
  } else {
    head = html`<span>수리 결과</span><strong class="money-big${summary.repair ? ' positive' : ''}">${summary.repair ? '확인함' : '기다리는 중'}</strong>`;
    rows = html`<div><dt>청구액</dt><dd>${money(claim.claimed, cur)}</dd></div>`;
  }
  return html`<section class="money-card" aria-label="금액 현황">
    <div class="money-head">${head}</div>
    <dl class="money-rows">${rows}</dl>
    ${recoveryMeter(claim)}
  </section>`;
}
