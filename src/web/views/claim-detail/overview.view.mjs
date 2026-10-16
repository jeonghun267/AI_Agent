import {html} from '../../core/html.mjs';
import {money} from '../../core/format.mjs';

function statusActions(claim) {
  if (claim.deleted) {
    return html`<div class="notice warning"><span>휴지통에 있는 건이에요. 복원하면 다시 진행할 수 있어요.</span>
      <button class="btn small primary" type="button" data-action="restore-current">복원</button></div>`;
  }
  const closed = ['waived', 'completed'].includes(claim.state);
  return html`<div class="actions">
    ${!closed ? html`
      <button class="btn small" type="button" data-action="transition" data-transition="awaiting">답변 기다리는 중</button>
      <button class="btn small" type="button" data-action="transition" data-transition="negotiating">합의 진행</button>
      <button class="btn small" type="button" data-action="transition" data-transition="disputed">분쟁으로 기록</button>
      <button class="btn small danger" type="button" data-action="transition" data-transition="waived">포기로 기록</button>` : ''}
    ${['waived', 'disputed', 'completed'].includes(claim.state) ? html`<button class="btn small" type="button" data-action="transition" data-transition="reopen">사유 남기고 재개</button>` : ''}
    <button class="btn small ghost" type="button" data-action="trash-claim">휴지통으로 이동</button>
  </div>`;
}

export function render(claim) {
  const cur = claim.currency;
  const editable = !claim.deleted && !['waived', 'completed'].includes(claim.state);
  return html`<div class="split">
    <div>
      <div class="section-title"><h2>주문과 청구</h2>
        ${editable ? html`<button class="btn small" type="button" data-action="edit-claim">정보·합의 수정</button>` : ''}</div>
      <dl class="fact-grid">
        <div><dt>판매처</dt><dd>${claim.vendorUrl ? html`<a href="${claim.vendorUrl}" target="_blank" rel="noopener noreferrer">${claim.vendor}</a>` : claim.vendor}</dd></div>
        <div><dt>주문번호</dt><dd>${claim.orderRef}</dd></div>
        <div><dt>주문일</dt><dd>${claim.orderedOn}</dd></div>
        <div><dt>청구액</dt><dd>${money(claim.claimed, cur)}</dd></div>
        <div><dt>합의액</dt><dd>${claim.agreed === null ? '아직 합의 전' : money(claim.agreed, cur)}</dd></div>
        <div><dt>실제로 받은 금액</dt><dd class="positive">${money(claim.summary.cash, cur)}</dd></div>
      </dl>
      <table class="inline-table">
        <thead><tr><th>품목</th><th>주문</th><th>문제</th><th>단가</th></tr></thead>
        <tbody>${claim.items.map(item => html`<tr>
          <td>${item.name}${item.sku ? html`<br><small>${item.sku}</small>` : ''}</td>
          <td>${item.orderedQty}</td><td>${item.claimQty}</td><td>${money(item.unitPrice, cur)}</td></tr>`)}</tbody>
      </table>
      <h3>문제 설명</h3>
      <p class="prewrap">${claim.issue}</p>
      ${claim.issueEnglish ? html`<h3 class="spaced">영문 설명</h3><p class="prewrap" lang="en">${claim.issueEnglish}</p>` : ''}
      ${claim.deadline ? html`<div class="notice warning"><span>판매처 기한 ${claim.deadline} (${claim.deadlineZone})<br>근거: ${claim.deadlineQuote}</span></div>` : ''}
    </div>
    <div>
      <h2>진행 상태</h2>
      <p class="muted">판매처와의 진행 상황이 바뀌면 사유와 함께 기록하세요. 지난 기록은 지워지지 않아요.</p>
      ${claim.lastReason ? html`<p class="status-line">최근 변경 사유: ${claim.lastReason}</p>` : ''}
      ${statusActions(claim)}
    </div>
  </div>`;
}

export const handlers = {
  click: {
    'edit-claim': ({vms}) => vms.app.openDialog('claim-form', {mode: 'edit'}),
    transition: ({el, vms}) => vms.app.openDialog('transition', {action: el.dataset.transition}),
    'trash-claim': ({vms}) => vms.app.openDialog('trash'),
    'restore-current': async ({vms}) => {
      await vms.detail.restore();
      vms.app.notify('클레임을 복원했어요.');
    },
  },
};
