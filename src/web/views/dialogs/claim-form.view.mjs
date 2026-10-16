import {html, toMarkup} from '../../core/html.mjs';
import {decimal, today} from '../../core/format.mjs';
import {newRequestKey} from '../../core/http-client.mjs';
import {formValues} from '../../core/dom.mjs';
import {field, textArea, selectField, formActions} from '../components/ui.view.mjs';

const EMPTY_ITEM = {name: '', sku: '', orderedQty: 1, claimQty: 1, unitPrice: ''};

function itemRow(item, index) {
  return html`<fieldset class="item-row" data-item>
    <legend>품목 ${index + 1}</legend>
    <div class="form-grid">
      ${field('품목명', `name-${index}`, item.name, {required: true, attrs: 'maxlength="150"'})}
      ${field('상품 코드 (선택)', `sku-${index}`, item.sku, {attrs: 'maxlength="100"'})}
      ${field('주문 수량', `orderedQty-${index}`, item.orderedQty, {type: 'number', required: true, attrs: 'min="1" max="10000"'})}
      ${field('문제 있는 수량', `claimQty-${index}`, item.claimQty, {type: 'number', required: true, attrs: 'min="1" max="10000"'})}
      ${field('단가', `unitPrice-${index}`, item.unitPrice, {required: true, attrs: 'inputmode="decimal"'})}
    </div>
    ${index ? html`<button type="button" class="btn small ghost" data-action="remove-item">이 품목 삭제</button>` : ''}
  </fieldset>`;
}

// Form values for create, edit, or edit prefilled with an AI extraction.
function initialValues(mode, claim, suggestion) {
  const base = mode === 'edit' ? {
    ...claim,
    claimedAmount: decimal(claim.claimed, claim.currency),
    agreedAmount: decimal(claim.agreed, claim.currency),
    items: claim.items.map(item => ({...item, unitPrice: decimal(item.unitPrice, claim.currency)})),
  } : {kind: 'refund', currency: 'USD', orderedOn: today(), deadlineZone: 'Asia/Seoul', items: [EMPTY_ITEM]};
  if (!suggestion) return base;
  const filled = Object.fromEntries(Object.entries(suggestion).filter(([, value]) => value !== null && !(Array.isArray(value) && !value.length)));
  return {...base, ...filled, items: filled.items?.map(item => ({...EMPTY_ITEM, ...item, unitPrice: item.unitPrice ?? ''})) ?? base.items};
}

export function render({mode, suggestion}, {detail, session}) {
  const config = session.config;
  const value = initialValues(mode, detail.claim, suggestion);
  const currencies = Object.entries(config.currencies).map(([code, info]) => [code, `${code} · ${info.label}`]);
  return {
    title: mode === 'edit' ? '정보·합의 수정' : '새 클레임',
    body: html`<form id="claim-form" data-mode="${mode}" data-key="${newRequestKey()}">
      ${suggestion ? html`<div class="ai-note">AI가 문서에서 읽은 값을 채웠어요. 원문과 다르지 않은지 확인한 뒤 저장하세요.</div>` : ''}
      <div class="form-grid">
        ${field('상품명', 'title', value.title, {required: true, attrs: 'maxlength="150"'})}
        ${field('판매처', 'vendor', value.vendor, {required: true, attrs: 'maxlength="100" placeholder="예: Amazon US, AliExpress 판매자명"'})}
        ${field('주문번호', 'orderRef', value.orderRef, {required: true, attrs: 'maxlength="100"'})}
        ${field('주문일', 'orderedOn', value.orderedOn, {type: 'date', required: true, attrs: `max="${today()}"`})}
        ${selectField('요청할 처리', 'kind', Object.entries(config.claimKinds), value.kind)}
        ${selectField('통화', 'currency', currencies, value.currency)}
        ${field('청구액', 'claimedAmount', value.claimedAmount, {required: true, attrs: 'inputmode="decimal"', hint: '판매처에 요청하는 금액'})}
        ${field('합의액 (선택)', 'agreedAmount', value.agreedAmount, {attrs: 'inputmode="decimal"', hint: '판매처와 합의한 금액. 아직이면 비워 두세요.'})}
        ${field('판매처 주소 (선택)', 'vendorUrl', value.vendorUrl, {type: 'url', full: true, attrs: 'maxlength="300" placeholder="https://"'})}
        ${textArea('문제 설명', 'issue', value.issue, {required: true})}
        ${textArea('영문 설명 (선택)', 'issueEnglish', value.issueEnglish, {
          hint: '판매처에 보낼 영어 문장이에요. 비워 두면 문의 초안을 만들 때 번역해요.',
          extra: session.ai.enabled ? html`<button class="btn small" type="button" data-action="translate-issue">AI로 영문 작성</button>` : '',
        })}
        <div id="item-rows" class="full">${value.items.map(itemRow)}</div>
        <button type="button" class="btn small full" data-action="add-item">+ 품목 추가</button>
        ${field('판매처 기한 (선택)', 'deadline', value.deadline, {type: 'date'})}
        ${selectField('기한 시간대', 'deadlineZone', config.deadlineZones.map(zone => [zone, zone]), value.deadlineZone)}
        ${field('기한 근거 (판매처 원문)', 'deadlineQuote', value.deadlineQuote, {full: true, attrs: 'maxlength="1000"'})}
      </div>
      ${formActions(mode === 'edit' ? '저장' : '클레임 만들기')}
    </form>`,
  };
}

function readClaimForm(form) {
  const values = formValues(form);
  const items = [...form.querySelectorAll('[data-item]')].map(row =>
    Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.name.replace(/-\d+$/, ''), input.value])));
  const input = {...values, items};
  for (const key of Object.keys(input)) if (/-\d+$/.test(key)) delete input[key];
  return input;
}

export const handlers = {
  click: {
    'add-item': () => {
      const rows = document.querySelector('#item-rows');
      rows.insertAdjacentHTML('beforeend', toMarkup(itemRow(EMPTY_ITEM, rows.querySelectorAll('[data-item]').length)));
    },
    'remove-item': ({el}) => el.closest('[data-item]').remove(),
    'translate-issue': ({el, vms}) => vms.ai.ensureConsent(async () => {
      const form = el.closest('form');
      const {english} = await vms.ai.translateIssue(form.elements.issue.value);
      form.elements.issueEnglish.value = english;
      vms.app.notify('영문 설명을 채웠어요. 내용을 확인해 주세요.');
    }),
  },
  submit: {
    'claim-form': async ({form, vms}) => {
      const input = readClaimForm(form);
      if (form.dataset.mode === 'edit') {
        await vms.detail.update(input);
        vms.app.closeDialog();
        vms.app.notify('저장했어요.');
        return;
      }
      const claim = await vms.list.create(input, form.dataset.key);
      vms.app.closeDialog();
      await vms.app.go({name: 'claim', id: claim.id, tab: 'files'});
      vms.app.notify('클레임을 만들었어요. 주문 내역이나 불량 사진을 올려 주세요.');
    },
  },
};
