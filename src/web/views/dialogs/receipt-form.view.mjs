import {html} from '../../core/html.mjs';
import {money, today, parseAmount} from '../../core/format.mjs';
import {newRequestKey} from '../../core/http-client.mjs';
import {formValues, renderInto} from '../../core/dom.mjs';
import {field, selectField, checkbox, formActions} from '../components/ui.view.mjs';
import {icon} from '../components/icons.view.mjs';

const KIND_FOR_CLAIM = {refund: 'cash', exchange: 'goods', repair: 'repair'};
const KIND_INFO = {
  cash: ['coin', '환불 입금', '카드 취소, 계좌 입금, PayPal 환불처럼 실제로 들어온 돈'],
  goods: ['box', '교환품 수령', '실제로 받은 교환품 수량'],
  repair: ['wrench', '수리 완료', '수리된 물건을 실제로 받았는지'],
  reversal: ['undo', '기록 정정', '잘못 남긴 기록을 취소하는 항목. 원래 기록은 지워지지 않아요.'],
};

const percent = (got, target) => target ? Math.min(100, Math.max(0, Math.round((got / target) * 100))) : 0;

// "지금 → 저장 후" so a typo is caught before it becomes a record (DESIGN.md §9).
//   delta: minor units for money, a count for goods (negative for a correction)
function previewMarkup(claim, unit, delta) {
  const {summary} = claim;
  const change = (label, before, after) => html`<div class="preview-row"><span>${label}</span><strong>${before}</strong>${icon('arrow')}<strong class="${after !== before ? 'is-after' : ''}">${after}</strong></div>`;
  if (unit === 'money') {
    const target = claim.agreed ?? claim.claimed;
    const after = summary.cash + delta;
    return html`${change('실제 회수액', money(summary.cash, claim.currency), money(after, claim.currency))}
      ${change('회수율', `${percent(summary.cash, target)}%`, `${percent(after, target)}%`)}
      ${after === target && delta ? html`<p class="preview-note positive">${icon('check')}합의액을 모두 받게 돼요.</p>` : ''}
      ${after > target ? html`<p class="preview-note warning">${icon('alert')}목표 금액(${money(target, claim.currency)})보다 많아요. 금액을 확인하세요.</p>` : ''}`;
  }
  if (unit === 'count') {
    const after = summary.goods + delta;
    return html`${change('받은 교환품', `${summary.goods}/${summary.requestedQty}개`, `${after}/${summary.requestedQty}개`)}
      ${after > summary.requestedQty ? html`<p class="preview-note warning">${icon('alert')}요청한 수량보다 많아요. 수량을 확인하세요.</p>` : ''}`;
  }
  return change('수리 결과', summary.repair ? '확인함' : '아직 없음', delta < 0 ? '아직 없음' : '확인함');
}

const unitOf = (kind, original) => kind === 'cash' || original?.amount ? 'money' : kind === 'goods' || original?.quantity ? 'count' : 'repair';

export function render({reverses}, {detail}) {
  const claim = detail.claim;
  const kind = reverses ? 'reversal' : KIND_FOR_CLAIM[claim.kind];
  const original = reverses && claim.ledger.find(entry => entry.id === reverses);
  const [iconName, label, description] = KIND_INFO[kind];
  const unit = unitOf(kind, original);
  const initialDelta = reverses ? -(original.amount || original.quantity || 1) : kind === 'repair' ? 1 : 0;
  return {
    title: reverses ? '기록 정정' : '실제로 받은 것 기록',
    body: html`<form id="receipt-form" data-key="${newRequestKey()}" data-unit="${unit}">
      <input type="hidden" name="kind" value="${kind}">
      <div class="receipt-type">${icon(iconName)}<div><strong>${label}</strong><small>${description}</small></div></div>
      ${reverses ? html`<input type="hidden" name="reverses" value="${reverses}">
        <div class="notice warning">"${original.amount ? money(original.amount, claim.currency) : `${original.quantity}개`}" 기록을 취소하는 정정 항목을 추가해요. 원래 기록은 남아요.</div>`
      : html`<div class="notice warning">카드·은행 내역이나 실제 받은 물건을 확인한 뒤 기록하세요. 판매처의 "환불했다" 통지만으로는 기록하지 않아요.</div>`}
      <div class="form-grid">
        ${kind === 'cash' ? html`
          ${field('받은 금액', 'amount', '', {required: true, prefix: claim.currency, attrs: 'inputmode="decimal" placeholder="0.00"', hint: `아직 받지 못한 금액: ${money(claim.summary.remaining, claim.currency)}`})}
          ${field('거래 식별자 (선택)', 'transactionRef', '', {attrs: 'maxlength="100" spellcheck="false"', hint: '카드 승인번호, 은행 거래번호 등. 같은 입금을 두 번 세지 않게 막아요.'})}` : ''}
        ${kind === 'goods' ? field('받은 교환품 수량', 'quantity', 1, {type: 'number', required: true, attrs: 'min="1" inputmode="numeric"'}) : ''}
        ${field('확인한 날짜', 'receivedOn', today(), {type: 'date', required: true, attrs: `max="${today()}"`})}
        ${selectField('확인 증빙', 'proofId', claim.files.map(file => [file.id, file.name]), claim.files[0]?.id)}
        <div class="field full"><label for="receipt-note">${reverses ? '정정 사유' : '메모'}</label>
          <textarea id="receipt-note" name="note" maxlength="2000" ${reverses ? html`required minlength="3"` : ''}></textarea></div>
      </div>
      <section class="receipt-preview" aria-label="저장하면 이렇게 바뀌어요">
        <h3>저장하면 이렇게 바뀌어요</h3>
        <div data-preview aria-live="polite">${previewMarkup(claim, unit, kind === 'goods' ? 1 : initialDelta)}</div>
      </section>
      ${checkbox('confirmed', '실제 내역과 선택한 증빙을 직접 확인했어요.', {required: true})}
      ${kind === 'cash' ? html`
        ${checkbox('missingReferenceConfirmed', '거래 식별자가 없어요. 대신 메모를 10자 이상 남겼어요.')}
        ${checkbox('duplicateReviewed', '같은 날짜·금액의 기록과 겹치지 않는지 확인했어요.')}` : ''}
      ${formActions(reverses ? '정정 기록' : '기록')}
    </form>`,
  };
}

export const handlers = {
  input: {
    // The preview follows the amount or quantity as it is typed.
    'form:receipt-form': ({el, vms}) => {
      if (!['amount', 'quantity'].includes(el.name)) return;
      const claim = vms.detail.state.claim;
      const delta = el.name === 'amount' ? parseAmount(el.value, claim.currency) ?? 0 : Math.max(0, Math.trunc(Number(el.value)) || 0);
      renderInto(el.form.querySelector('[data-preview]'), previewMarkup(claim, el.form.dataset.unit, delta));
    },
  },
  submit: {
    'receipt-form': async ({form, vms}) => {
      const values = formValues(form);
      const before = vms.detail.state.claim.state;
      const claim = await vms.detail.recordReceipt({...values, reverses: values.reverses || null}, form.dataset.key);
      vms.app.closeDialog();
      // The one celebration moment (DESIGN.md §8): the first time everything came back.
      if (claim.state === 'recovered' && before !== 'recovered') vms.app.openDialog('celebrate', {claim});
      else vms.app.notify(values.kind === 'reversal' ? '정정 기록을 남겼어요.' : '회수 기록이 저장됐어요.');
    },
  },
};
