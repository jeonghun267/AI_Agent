import {html} from '../../core/html.mjs';
import {money, shortDate} from '../../core/format.mjs';
import {statePill} from './ui.view.mjs';
import {miniSteps, recoveryMeter, recoveryShort} from './progress.view.mjs';

// What is still missing, in the claim's own unit.
function remainingText(claim) {
  if (claim.kind === 'exchange') return `${Math.max(0, claim.summary.requestedQty - claim.summary.goods)}개`;
  if (claim.kind === 'repair') return claim.summary.repair ? '없음' : '수리 대기';
  return money(claim.summary.remaining, claim.currency);
}

// One claim in a list: money and progress side by side (DESIGN.md §7 "클레임 카드").
// The whole card is one link (the title's link stretches over it); the restore
// button in the trash sits above that link.
export function claimCard(claim, labels, {trash = false} = {}) {
  return html`<article class="claim-card${claim.state === 'disputed' ? ' is-disputed' : ''}">
    <div class="claim-card-head">
      <div class="claim-card-titles">
        <h3><a class="claim-card-link" href="#/claims/${claim.id}">${claim.title}</a></h3>
        <p class="claim-card-sub"><span>${claim.vendor}</span><span>주문 ${claim.orderRef}</span><span>${labels.claimKinds[claim.kind]}</span></p>
      </div>
      ${statePill(claim.state, labels.states)}
    </div>
    ${miniSteps(claim)}
    <dl class="claim-amounts">
      <div><dt>청구</dt><dd>${money(claim.claimed, claim.currency)}</dd></div>
      <div><dt>합의</dt><dd>${claim.agreed === null ? html`<span class="muted">미합의</span>` : money(claim.agreed, claim.currency)}</dd></div>
      <div><dt>회수</dt><dd class="positive">${recoveryShort(claim)}</dd></div>
      <div class="is-remaining"><dt>${claim.kind === 'refund' ? '미회수' : '남은 것'}</dt><dd>${remainingText(claim)}</dd></div>
    </dl>
    ${recoveryMeter(claim, {compact: true})}
    <div class="claim-card-foot">
      <small>${trash ? `${shortDate(claim.deletedAt)} 삭제` : `마지막 활동 ${shortDate(claim.updatedAt)}`}</small>
      ${trash ? html`<button class="btn small" type="button" data-action="restore-claim" data-id="${claim.id}">복원</button>` : ''}
    </div>
  </article>`;
}

export const claimCards = (claims, labels, options) => html`<div class="card-list">${claims.map(claim => claimCard(claim, labels, options))}</div>`;
