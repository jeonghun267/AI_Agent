import {html} from '../../core/html.mjs';
import {money} from '../../core/format.mjs';
import {selectVisibleClaims, selectMetrics} from '../../viewmodels/claim-list.vm.mjs';
import {statePill, emptyState} from '../components/ui.view.mjs';

function metrics(list) {
  const {activeCount, byCurrency} = selectMetrics(list);
  const perCurrency = (key) => byCurrency.length
    ? byCurrency.map(row => html`<span class="money-line">${money(row[key], row.currency)}</span>`)
    : html`<span class="money-line">-</span>`;
  return html`<section class="metrics" aria-label="회수 현황">
    <article class="metric"><p>진행 중</p><strong>${activeCount}<small>건</small></strong></article>
    <article class="metric"><p>진행 중 청구액</p><div class="money">${perCurrency('claimed')}</div></article>
    <article class="metric"><p>실제로 받은 금액</p><div class="money positive">${perCurrency('received')}</div></article>
    <article class="metric"><p>아직 못 받은 금액</p><div class="money">${perCurrency('remaining')}</div></article>
  </section>`;
}

export function claimTable(claims, labels, {trash = false} = {}) {
  return html`<table class="claims-table">
    <thead><tr><th>상품 / 판매처</th><th>상태</th><th>청구액</th><th>합의액</th><th>받은 금액</th>${trash ? html`<th></th>` : ''}</tr></thead>
    <tbody>${claims.map(claim => html`<tr>
      <td><a class="case-name" href="#/claims/${claim.id}">${claim.title}</a>
        <span class="case-caption">${claim.vendor} · ${claim.orderRef} · ${labels.claimKinds[claim.kind]}</span></td>
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
  const visible = selectVisibleClaims(list);
  let body;
  if (list.loading && !list.claims.length) body = emptyState('불러오는 중이에요');
  else if (list.error) body = emptyState('목록을 불러오지 못했어요', list.error);
  else if (!list.claims.length) body = emptyState('아직 등록한 클레임이 없어요', '해외에서 산 상품에 문제가 생겼다면 새 클레임을 만들어 보세요.');
  else if (!visible.length) body = emptyState('조건에 맞는 클레임이 없어요', '검색어나 상태를 바꿔 보세요.');
  else body = claimTable(visible, labels);

  return html`
    <div class="heading">
      <div><h1>내 해외 구매 클레임</h1><p>청구액, 합의액, 실제로 받은 금액을 나눠서 확인하세요.</p></div>
      <button class="btn primary" type="button" data-action="new-claim">+ 새 클레임</button>
    </div>
    ${metrics(list)}
    <section class="panel">
      <div class="toolbar">
        <input class="search" id="claim-search" type="search" placeholder="상품명, 판매처, 주문번호 검색" aria-label="클레임 검색" value="${list.query}">
        <select id="state-filter" aria-label="상태로 거르기">
          <option value="">모든 상태</option>
          ${Object.entries(labels.states).map(([value, label]) => html`<option value="${value}" ${list.filter === value ? html`selected` : ''}>${label}</option>`)}
        </select>
      </div>
      ${body}
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
