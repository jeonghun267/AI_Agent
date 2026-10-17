import {html} from '../../core/html.mjs';
import {money, shortDate} from '../../core/format.mjs';
import {icon} from '../components/icons.view.mjs';

// 개요: the facts of the order and the problem. The money is in the header above.
export function render(claim, {session}) {
  const cur = claim.currency;
  const labels = session.config;
  const editable = !claim.deleted && !['waived', 'completed'].includes(claim.state);
  return html`
    <section class="detail-section">
      <div class="section-title"><h2>주문 정보</h2>
        ${editable ? html`<button class="btn small" type="button" data-action="edit-claim">${icon('edit')}정보·합의 수정</button>` : ''}</div>
      <dl class="fact-grid">
        <div><dt>판매처</dt><dd>${claim.vendorUrl ? html`<a href="${claim.vendorUrl}" target="_blank" rel="noopener noreferrer">${claim.vendor}</a>` : claim.vendor}</dd></div>
        <div><dt>주문번호</dt><dd>${claim.orderRef}</dd></div>
        <div><dt>주문일</dt><dd>${shortDate(claim.orderedOn)}</dd></div>
        <div><dt>요청</dt><dd>${labels.claimKinds[claim.kind]}</dd></div>
        <div><dt>통화</dt><dd>${cur} · ${labels.currencies[cur]?.label ?? ''}</dd></div>
        <div><dt>청구액</dt><dd>${money(claim.claimed, cur)}</dd></div>
      </dl>
    </section>
    <section class="detail-section">
      <h2>품목</h2>
      <div class="table-scroll"><table class="inline-table">
        <thead><tr><th>품목</th><th class="num">주문</th><th class="num">문제</th><th class="num">단가</th><th class="num">문제 금액</th></tr></thead>
        <tbody>${claim.items.map(item => html`<tr>
          <td>${item.name}${item.sku ? html`<br><small>${item.sku}</small>` : ''}</td>
          <td class="num">${item.orderedQty}</td><td class="num">${item.claimQty}</td>
          <td class="num">${money(item.unitPrice, cur)}</td><td class="num">${money(item.unitPrice * item.claimQty, cur)}</td></tr>`)}</tbody>
      </table></div>
    </section>
    <section class="detail-section">
      <h2>문제 설명</h2>
      <p class="prewrap">${claim.issue}</p>
      ${claim.issueEnglish ? html`<h3>판매처에 전할 영문 설명</h3><p class="prewrap" lang="en">${claim.issueEnglish}</p>` : ''}
      ${claim.deadline ? html`<div class="notice warning"><span>${icon('clock')}판매처 기한 ${claim.deadline} (${claim.deadlineZone})<br>근거: ${claim.deadlineQuote}</span></div>` : ''}
    </section>`;
}

// Side column: changing the state by hand and moving to the trash are
// secondary, so they sit folded under "사건 관리" (DESIGN.md §1.2).
export function manageCard(claim) {
  if (claim.deleted) return '';
  const closed = ['waived', 'completed'].includes(claim.state);
  const action = (transition, label, extra = '') => html`<button class="manage-item${extra}" type="button" data-action="transition" data-transition="${transition}">${label}</button>`;
  return html`<section class="side-card manage-card">
    <details>
      <summary><span>${icon('settings')}사건 관리</span><small>상태 직접 바꾸기 · 휴지통</small></summary>
      <p class="muted">판매처와의 진행 상황이 바뀌면 사유와 함께 기록하세요. 지난 기록은 지워지지 않아요.</p>
      ${claim.lastReason ? html`<p class="status-line">최근 변경 사유: ${claim.lastReason}</p>` : ''}
      <div class="manage-list">
        ${!closed ? html`
          ${claim.state !== 'awaiting' ? action('awaiting', '판매처 답변 기다리는 중으로') : ''}
          ${claim.state !== 'negotiating' ? action('negotiating', '합의 진행 중으로') : ''}
          ${claim.state !== 'disputed' ? action('disputed', '분쟁으로 기록') : ''}
          ${action('waived', '포기로 기록', ' danger')}` : ''}
        ${['waived', 'disputed', 'completed'].includes(claim.state) ? action('reopen', '사유 남기고 다시 진행') : ''}
        <button class="manage-item" type="button" data-action="trash-claim">${icon('trash')}휴지통으로 이동</button>
      </div>
    </details>
  </section>`;
}

export const handlers = {
  click: {
    'edit-claim': ({el, vms}) => vms.app.openDialog('claim-form', {mode: 'edit', focus: el.dataset.focus || ''}),
    transition: ({el, vms}) => vms.app.openDialog('transition', {action: el.dataset.transition}),
    'trash-claim': ({vms}) => vms.app.openDialog('trash'),
    'restore-current': async ({vms}) => {
      await vms.detail.restore();
      vms.app.notify('클레임을 복원했어요.');
    },
  },
};
