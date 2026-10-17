import {html} from '../../core/html.mjs';
import {money, shortDate} from '../../core/format.mjs';
import {emptyState} from '../components/ui.view.mjs';
import {icon} from '../components/icons.view.mjs';

const KIND_ICON = {cash: 'coin', goods: 'box', repair: 'wrench', reversal: 'undo'};

function summaryStrip(claim) {
  const cur = claim.currency;
  const {summary} = claim;
  const cells = {
    refund: [['실제 회수액', money(summary.cash, cur), 'positive'], ['아직 못 받은 금액', money(summary.remaining, cur), ''], ['목표', claim.agreed === null ? `${money(claim.claimed, cur)} (청구액)` : `${money(claim.agreed, cur)} (합의액)`, '']],
    exchange: [['받은 교환품', `${summary.goods} / ${summary.requestedQty}개`, 'positive']],
    repair: [['수리 결과', summary.repair ? '확인함' : '아직 없음', summary.repair ? 'positive' : '']],
  }[claim.kind];
  return html`<dl class="stat-strip">${cells.map(([label, value, tone]) => html`<div><dt>${label}</dt><dd class="${tone}">${value}</dd></div>`)}</dl>`;
}

export function render(claim, {session}) {
  const kinds = session.config.receiptKinds;
  const cur = claim.currency;
  const open = !claim.deleted && !['waived', 'completed'].includes(claim.state);
  const reversed = new Set(claim.ledger.map(entry => entry.reverses).filter(Boolean));
  const fileName = id => claim.files.find(file => file.id === id)?.name ?? '삭제된 파일';
  return html`
    <div class="section-title"><div><h2>실제 회수 기록</h2><p class="muted">약속이나 통지가 아니라, 실제로 받은 입금·교환품·수리 결과만 기록해요.</p></div>
      ${open ? html`<button class="btn small" type="button" data-action="record-receipt" ${claim.files.length ? '' : html`disabled title="먼저 증빙을 올려 주세요"`}>${icon('coin')}회수 기록하기</button>` : ''}</div>
    ${summaryStrip(claim)}
    ${claim.ledger.length ? html`<div class="stack">${claim.ledger.map(entry => html`<article class="ledger-entry kind-${entry.kind}${reversed.has(entry.id) ? ' is-reversed' : ''}">
      <span class="ledger-icon">${icon(KIND_ICON[entry.kind])}</span>
      <div class="ledger-body">
        <header>
          <strong>${kinds[entry.kind]} ${entry.amount ? money(entry.amount, cur) : entry.quantity ? `${entry.quantity}개` : ''}</strong>
          ${reversed.has(entry.id) ? html`<span class="tag">정정됨</span>` : ''}
          <small>${shortDate(entry.receivedOn)} 확인</small>
        </header>
        <p>${entry.note || '메모 없음'}</p>
        <small class="case-caption">${entry.transactionRef ? html`<span>거래 ${entry.transactionRef}</span>` : ''}<span>증빙 ${fileName(entry.proofId)}</span></small>
        ${open && entry.kind !== 'reversal' && !reversed.has(entry.id) ? html`<button class="btn small ghost" type="button" data-action="reverse-receipt" data-receipt="${entry.id}">${icon('undo')}잘못 기록했어요 (정정)</button>` : ''}
      </div>
    </article>`)}</div>` : emptyState('아직 실제로 받은 기록이 없어요', '카드·은행 내역이나 받은 물건을 확인한 뒤 기록하세요.', {compact: true})}
    <p class="status-line">${icon('lock')}은행·배송 조회는 연결되어 있지 않아요. 기록은 고치거나 지우는 대신 정정 항목을 추가해요.</p>`;
}

export const handlers = {
  click: {
    'record-receipt': ({vms}) => vms.app.openDialog('receipt', {reverses: null}),
    'reverse-receipt': ({el, vms}) => vms.app.openDialog('receipt', {reverses: el.dataset.receipt}),
  },
};
