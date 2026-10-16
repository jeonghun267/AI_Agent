import {html} from '../../core/html.mjs';
import {money} from '../../core/format.mjs';
import {emptyState} from '../components/ui.view.mjs';

export function render(claim, {session}) {
  const kinds = session.config.receiptKinds;
  const cur = claim.currency;
  const open = !claim.deleted && !['waived', 'completed'].includes(claim.state);
  const reversed = new Set(claim.ledger.map(entry => entry.reverses).filter(Boolean));
  const fileName = id => claim.files.find(file => file.id === id)?.name ?? '삭제된 파일';
  return html`
    <div class="section-title"><div><h2>실제 회수 기록</h2><p class="muted">약속이나 통지가 아니라, 실제로 받은 입금·교환품·수리 결과만 기록해요.</p></div>
      ${open ? html`<button class="btn primary small" type="button" data-action="record-receipt" ${claim.files.length ? '' : html`disabled title="먼저 증빙을 올려 주세요"`}>실제로 받은 것 기록</button>` : ''}</div>
    <dl class="fact-grid">${{
      refund: html`
        <div><dt>합의액</dt><dd>${claim.agreed === null ? '아직 합의 전' : money(claim.agreed, cur)}</dd></div>
        <div><dt>실제로 받은 금액</dt><dd class="positive">${money(claim.summary.cash, cur)}</dd></div>
        <div><dt>아직 못 받은 금액</dt><dd>${money(claim.summary.remaining, cur)}</dd></div>`,
      exchange: html`<div><dt>교환품 수령</dt><dd>${claim.summary.goods} / ${claim.summary.requestedQty}개</dd></div>`,
      repair: html`<div><dt>수리 결과</dt><dd>${claim.summary.repair ? '확인함' : '아직 없음'}</dd></div>`,
    }[claim.kind]}</dl>
    ${claim.ledger.length ? claim.ledger.map(entry => html`<article class="item-card${entry.kind === 'reversal' ? ' reversal' : ''}">
      <header><strong>${kinds[entry.kind]} ${entry.amount ? money(entry.amount, cur) : entry.quantity ? `${entry.quantity}개` : ''}</strong><small>${entry.receivedOn}</small></header>
      <p>${entry.note || '메모 없음'}</p>
      <small class="case-caption">${entry.transactionRef ? html`<span>거래 ${entry.transactionRef}</span>` : ''}<span>증빙 ${fileName(entry.proofId)}</span></small>
      ${open && entry.kind !== 'reversal' && !reversed.has(entry.id) ? html`<div class="actions"><button class="btn small" type="button" data-action="reverse-receipt" data-receipt="${entry.id}">잘못 기록했어요 (정정)</button></div>` : ''}
    </article>`) : emptyState('아직 실제로 받은 기록이 없어요')}
    ${open && claim.state === 'recovered' ? html`<div class="actions"><button class="btn primary" type="button" data-action="transition" data-transition="close">결과 확인하고 종료</button></div>` : ''}
    <p class="status-line">은행·배송 조회는 연결되어 있지 않아요. 기록은 고치거나 지우는 대신 정정 항목을 추가해요.</p>`;
}

export const handlers = {
  click: {
    'record-receipt': ({vms}) => vms.app.openDialog('receipt', {reverses: null}),
    'reverse-receipt': ({el, vms}) => vms.app.openDialog('receipt', {reverses: el.dataset.receipt}),
  },
};
