import {html} from '../../core/html.mjs';
import {money, today} from '../../core/format.mjs';
import {newRequestKey} from '../../core/http-client.mjs';
import {formValues} from '../../core/dom.mjs';
import {field, selectField, checkbox, formActions} from '../components/ui.view.mjs';

const KIND_FOR_CLAIM = {refund: 'cash', exchange: 'goods', repair: 'repair'};

export function render({reverses}, {detail}) {
  const claim = detail.claim;
  const kind = reverses ? 'reversal' : KIND_FOR_CLAIM[claim.kind];
  const original = reverses && claim.ledger.find(entry => entry.id === reverses);
  return {
    title: reverses ? '기록 정정' : '실제로 받은 것 기록',
    body: html`<form id="receipt-form" data-key="${newRequestKey()}">
      <input type="hidden" name="kind" value="${kind}">
      ${reverses ? html`<input type="hidden" name="reverses" value="${reverses}">
        <div class="notice warning">"${original.amount ? money(original.amount, claim.currency) : `${original.quantity}개`}" 기록을 취소하는 정정 항목을 추가해요. 원래 기록은 남아요.</div>`
      : html`<div class="notice warning">카드·은행 내역이나 실제 받은 물건을 확인한 뒤 기록하세요. 판매처의 "환불했다" 통지만으로는 기록하지 않아요.</div>`}
      <div class="form-grid">
        ${kind === 'cash' ? html`
          ${field(`받은 금액 (${claim.currency})`, 'amount', '', {required: true, attrs: 'inputmode="decimal"', hint: `아직 받지 못한 합의액: ${money(claim.summary.remaining, claim.currency)}`})}
          ${field('거래 식별자 (선택)', 'transactionRef', '', {attrs: 'maxlength="100"', hint: '카드 승인번호, 은행 거래번호 등. 같은 입금을 두 번 세지 않게 막아요.'})}` : ''}
        ${kind === 'goods' ? field('받은 교환품 수량', 'quantity', 1, {type: 'number', required: true, attrs: 'min="1"'}) : ''}
        ${field('확인한 날짜', 'receivedOn', today(), {type: 'date', required: true, attrs: `max="${today()}"`})}
        ${selectField('확인 증빙', 'proofId', claim.files.map(file => [file.id, file.name]), claim.files[0]?.id)}
        <div class="field full"><label for="receipt-note">${reverses ? '정정 사유' : '메모'}</label>
          <textarea id="receipt-note" name="note" maxlength="2000" ${reverses ? html`required minlength="3"` : ''}></textarea></div>
      </div>
      ${checkbox('confirmed', '실제 내역과 선택한 증빙을 직접 확인했어요.', {required: true})}
      ${kind === 'cash' ? html`
        ${checkbox('missingReferenceConfirmed', '거래 식별자가 없어요. 대신 메모를 10자 이상 남겼어요.')}
        ${checkbox('duplicateReviewed', '같은 날짜·금액의 기록과 겹치지 않는지 확인했어요.')}` : ''}
      ${formActions('기록')}
    </form>`,
  };
}

export const handlers = {
  submit: {
    'receipt-form': async ({form, vms}) => {
      const values = formValues(form);
      const before = vms.detail.state.claim.state;
      const claim = await vms.detail.recordReceipt({...values, reverses: values.reverses || null}, form.dataset.key);
      vms.app.closeDialog();
      // The one celebration moment (DESIGN.md §8): the first time everything came back.
      if (claim.state === 'recovered' && before !== 'recovered') vms.app.openDialog('celebrate', {claim});
      else vms.app.notify('기록했어요.');
    },
  },
};
