import {html} from '../../core/html.mjs';
import {selectVisibleClaims, selectGroupCounts, selectFilterOptions, LIST_GROUPS, LIST_SORTS} from '../../viewmodels/claim-list.vm.mjs';
import {pageHead, emptyState, skeletonCards} from '../components/ui.view.mjs';
import {claimCards} from '../components/claim-card.view.mjs';
import {icon} from '../components/icons.view.mjs';

const option = (value, label, selected) => html`<option value="${value}" ${value === selected ? html`selected` : ''}>${label}</option>`;

function tools(list) {
  const counts = selectGroupCounts(list.claims);
  const {vendors, currencies} = selectFilterOptions(list.claims);
  return html`<section class="list-tools" aria-label="찾기와 정렬">
    <div class="search-box">${icon('search')}
      <input id="claim-search" type="search" placeholder="상품명, 판매처, 주문번호로 검색…" aria-label="클레임 검색" value="${list.query}" autocomplete="off">
    </div>
    <div class="chip-row" role="group" aria-label="상태로 거르기">
      ${LIST_GROUPS.map(([key, label]) => html`<button class="chip${list.group === key ? ' active' : ''}" type="button" data-action="list-group" data-group="${key}" aria-pressed="${list.group === key}">${label}<span>${counts[key]}</span></button>`)}
    </div>
    <div class="list-selects">
      <select id="vendor-filter" aria-label="판매처로 거르기">${option('', '모든 판매처', list.vendor)}${vendors.map(vendor => option(vendor, vendor, list.vendor))}</select>
      <select id="currency-filter" aria-label="통화로 거르기">${option('', '모든 통화', list.currency)}${currencies.map(code => option(code, code, list.currency))}</select>
      <select id="list-sort" aria-label="정렬">${LIST_SORTS.map(([value, label]) => option(value, label, list.sort))}</select>
    </div>
  </section>`;
}

// Every claim as a card with its money and progress (DESIGN.md §2 "클레임 목록").
export function renderClaims({list, session}) {
  const heading = pageHead('내 클레임', '청구한 금액, 합의한 금액, 실제로 받은 금액을 클레임마다 비교하세요.');
  if (list.loading && !list.claims.length) return html`${heading}${skeletonCards(3)}`;
  if (list.error) return html`${heading}<section class="panel">${emptyState('목록을 불러오지 못했어요', `${list.error} 새로고침해서 다시 시도하세요.`)}</section>`;
  if (!list.claims.length) {
    return html`${heading}<section class="panel">${emptyState('아직 등록한 클레임이 없어요', '주문 정보부터 차근차근 등록해 보세요.', {dori: 'sm', action: {name: 'new-claim', label: '첫 클레임 등록하기'}})}</section>`;
  }
  const visible = selectVisibleClaims(list);
  const filtered = list.query || list.group || list.vendor || list.currency;
  return html`
    ${heading}
    ${tools(list)}
    <div class="result-line" role="status">
      <span>${visible.length}건${list.sort === 'remaining' ? ' · 통화별로 묶어 정렬했어요' : ''}</span>
      ${filtered ? html`<button class="btn ghost small" type="button" data-action="clear-filters">조건 지우기</button>` : ''}
    </div>
    ${visible.length ? claimCards(visible, session.config) : html`<section class="panel">${emptyState('조건에 맞는 클레임이 없어요', '검색어나 조건을 바꿔 보세요.', {compact: true})}</section>`}`;
}

export const handlers = {
  click: {
    'list-group': ({el, vms}) => vms.list.setFilters({group: el.dataset.group}),
    'clear-filters': ({vms}) => vms.list.clearFilters(),
  },
  input: {
    'claim-search': ({el, vms}) => vms.list.setQuery(el.value),
  },
  change: {
    'vendor-filter': ({el, vms}) => vms.list.setFilters({vendor: el.value}),
    'currency-filter': ({el, vms}) => vms.list.setFilters({currency: el.value}),
    'list-sort': ({el, vms}) => vms.list.setFilters({sort: el.value}),
  },
};
