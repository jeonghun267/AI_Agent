import {html} from '../../core/html.mjs';
import {money} from '../../core/format.mjs';
import {selectVisibleClaims, selectMetrics} from '../../viewmodels/claim-list.vm.mjs';
import {statePill, emptyState, skeletonRows} from '../components/ui.view.mjs';

// The one number the user cares about most leads the page (DESIGN.md §1).
function summary(list) {
  const {activeCount, byCurrency} = selectMetrics(list);
  const lines = key => byCurrency.map(row => html`<span class="money-line">${money(row[key], row.currency)}</span>`);
  return html`<section class="summary" aria-label="회수 현황">
    <div>
      <p class="summary-label">아직 받지 못한 금액</p>
      <div class="summary-amounts">${byCurrency.map(row => html`<strong class="summary-amount">${money(row.remaining, row.currency)}</strong>`)}</div>
    </div>
    <dl class="summary-facts">
      <div><dt>진행 중인 건</dt><dd>${activeCount}건</dd></div>
      <div><dt>진행 중 청구액</dt><dd>${lines('claimed')}</dd></div>
      <div><dt>실제로 받은 금액</dt><dd class="positive">${lines('received')}</dd></div>
    </dl>
  </section>`;
}

export function claimTable(claims, labels, {trash = false} = {}) {
  return html`<table class="claims-table">
    <thead><tr><th>상품</th><th>상태</th><th class="money-head">청구액</th><th class="money-head">합의액</th><th class="money-head">받은 금액</th>${trash ? html`<th><span class="visually-hidden">복원</span></th>` : ''}</tr></thead>
    <tbody>${claims.map(claim => html`<tr>
      <td><a class="case-name" href="#/claims/${claim.id}">${claim.title}</a>
        <span class="case-caption"><span>${claim.vendor}</span><span>주문 ${claim.orderRef}</span><span>${labels.claimKinds[claim.kind]}</span></span></td>
      <td data-label="상태">${statePill(claim.state, labels.states)}</td>
      <td class="money-cell" data-label="청구액">${money(claim.claimed, claim.currency)}</td>
      <td class="money-cell" data-label="합의액">${claim.agreed === null ? '미합의' : money(claim.agreed, claim.currency)}</td>
      <td class="money-cell positive" data-label="받은 금액">${money(claim.summary.cash, claim.currency)}</td>
      ${trash ? html`<td><button class="btn small" type="button" data-action="restore-claim" data-id="${claim.id}">복원</button></td>` : ''}
    </tr>`)}</tbody>
  </table>`;
}

export function renderDashboard({list, session}) {
  const labels = session.config;
  const heading = html`<div class="heading">
    <div><h1>내 해외 구매 클레임</h1><p>청구한 금액, 합의한 금액, 실제로 받은 금액을 나눠서 확인하세요.</p></div>
    <button class="btn primary" type="button" data-action="new-claim">+ 새 클레임</button>
  </div>`;

  if (list.loading && !list.claims.length) return html`${heading}<section class="panel">${skeletonRows()}</section>`;
  if (list.error) return html`${heading}<section class="panel">${emptyState('목록을 불러오지 못했어요', `${list.error} 새로고침해서 다시 시도하세요.`)}</section>`;
  if (!list.claims.length) {
    return html`${heading}<section class="panel">${emptyState('아직 등록한 클레임이 없어요',
      '해외에서 산 상품이 고장 났거나 다른 물건이 왔다면, 주문 정보부터 기록해 보세요.',
      {mark: true, action: {name: 'new-claim', label: '첫 클레임 만들기'}})}</section>`;
  }

  const visible = selectVisibleClaims(list);
  return html`
    ${heading}
    ${summary(list)}
    <section class="panel">
      <div class="toolbar">
        <input class="search" id="claim-search" type="search" placeholder="상품명, 판매처, 주문번호로 검색…" aria-label="클레임 검색" value="${list.query}" autocomplete="off">
        <select id="state-filter" aria-label="상태로 거르기">
          <option value="">모든 상태</option>
          ${Object.entries(labels.states).map(([value, label]) => html`<option value="${value}" ${list.filter === value ? html`selected` : ''}>${label}</option>`)}
        </select>
      </div>
      ${visible.length ? claimTable(visible, labels) : emptyState('조건에 맞는 클레임이 없어요', '검색어나 상태를 바꿔 보세요.')}
    </section>`;
}

export const handlers = {
  click: {
    'new-claim': ({vms}) => vms.app.openDialog('claim-form', {mode: 'create'}),
  },
  input: {
    'claim-search': ({el, vms}) => vms.list.setQuery(el.value),
  },
  change: {
    'state-filter': ({el, vms}) => vms.list.setFilter(el.value),
  },
};
