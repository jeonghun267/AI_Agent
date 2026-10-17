import {html, toMarkup} from '../../core/html.mjs';
import {decimal, today, money, parseAmount, fileSize} from '../../core/format.mjs';
import {newRequestKey} from '../../core/http-client.mjs';
import {formValues, renderInto} from '../../core/dom.mjs';
import {field, textArea, selectField, choiceCards, formActions, aiNote} from '../components/ui.view.mjs';
import {stepperHeader, stepperActions, onStepEnter} from '../components/stepper.view.mjs';
import {icon} from '../components/icons.view.mjs';
import {ACCEPT} from '../claim-detail/files.view.mjs';

// New claim: five short steps (DESIGN.md §7 "단계 진행").
//   1 기본 정보 · 2 주문·금액 · 3 문제 내용 · 4 증빙 · 5 확인
// Editing shows the same fields as one form, without the steps.
// AI and document reading only fill fields; the user checks before saving.

const EMPTY_ITEM = {name: '', sku: '', orderedQty: 1, claimQty: 1, unitPrice: ''};
const STEPS = ['기본 정보', '주문·금액', '문제 내용', '증빙', '확인'];
const KIND_CHOICES = [
  ['refund', '반품·환불', '돈으로 돌려받기', 'coin'],
  ['exchange', '교환', '다른 물건으로 받기', 'box'],
  ['repair', 'AS', '고쳐서 받기', 'wrench'],
];

// Files picked in step 4 wait here until the claim exists.
const pendingFiles = new WeakMap();
// Labels for the review step, kept from the last render.
let labels = null;

function itemRow(item, index, currency) {
  return html`<fieldset class="item-row" data-item>
    <legend>품목 ${index + 1}</legend>
    <div class="form-grid">
      ${field('품목명', `name-${index}`, item.name, {required: true, full: true, attrs: 'maxlength="150" placeholder="예: USB-C 허브 7-in-1"'})}
      ${field('주문 수량', `orderedQty-${index}`, item.orderedQty, {type: 'number', required: true, attrs: 'min="1" max="10000" inputmode="numeric"'})}
      ${field('문제 있는 수량', `claimQty-${index}`, item.claimQty, {type: 'number', required: true, attrs: 'min="1" max="10000" inputmode="numeric"'})}
      ${field('단가', `unitPrice-${index}`, item.unitPrice, {required: true, prefix: currency, attrs: 'inputmode="decimal" placeholder="0.00"'})}
      ${field('상품 코드 (선택)', `sku-${index}`, item.sku, {attrs: 'maxlength="100"'})}
    </div>
    ${index ? html`<button type="button" class="btn small ghost" data-action="remove-item">이 품목 빼기</button>` : ''}
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

const focusAttr = (name, focus) => name === focus ? ' autofocus' : '';

function basicsFields(value, config, focus) {
  return html`<div class="form-grid">
    ${field('판매처', 'vendor', value.vendor, {required: true, attrs: `maxlength="100" placeholder="예: Amazon US, AliExpress 판매자명"${focusAttr('vendor', focus)}`})}
    ${field('주문번호', 'orderRef', value.orderRef, {required: true, attrs: `maxlength="100" spellcheck="false"${focusAttr('orderRef', focus)}`})}
    ${field('주문일', 'orderedOn', value.orderedOn, {type: 'date', required: true, attrs: `max="${today()}"`})}
    ${field('상품명', 'title', value.title, {required: true, hint: '목록에서 이 이름으로 보여요.', attrs: `maxlength="150" placeholder="예: USB-C 허브"${focusAttr('title', focus)}`})}
    ${choiceCards('어떤 처리를 원하세요?', 'kind', KIND_CHOICES.filter(([key]) => config.claimKinds[key]), value.kind)}
    ${field('판매처 주소 (선택)', 'vendorUrl', value.vendorUrl, {type: 'url', full: true, attrs: 'maxlength="300" placeholder="https://"'})}
  </div>`;
}

function moneyFields(value, config, focus) {
  const currencies = Object.entries(config.currencies).map(([code, info]) => [code, `${code} · ${info.label}`]);
  return html`
    <div class="form-grid">${selectField('통화', 'currency', currencies, value.currency)}</div>
    <div id="item-rows">${value.items.map((item, index) => itemRow(item, index, value.currency))}</div>
    <button type="button" class="btn small" data-action="add-item">${icon('plus')}품목 추가</button>
    <div class="sum-box" data-sum aria-live="polite">${sumMarkup(itemsTotal(value.items, value.currency), value.currency, parseAmount(value.claimedAmount, value.currency))}</div>
    <div class="form-grid">
      ${field('청구액', 'claimedAmount', value.claimedAmount, {required: true, prefix: value.currency, hint: '판매처에 돌려 달라고 할 금액이에요.', attrs: `inputmode="decimal" placeholder="0.00"${focusAttr('claimedAmount', focus)}`})}
      ${field('합의액 (선택)', 'agreedAmount', value.agreedAmount, {prefix: value.currency, hint: '판매처와 합의한 금액. 아직이면 비워 두세요.', attrs: `inputmode="decimal" placeholder="0.00"${focusAttr('agreedAmount', focus)}`})}
    </div>`;
}

function issueFields(value, config, aiEnabled) {
  return html`<div class="form-grid">
    ${textArea('문제 설명', 'issue', value.issue, {required: true, hint: '한국어로 편하게 써 주세요. 무엇이, 언제, 어떻게 잘못됐는지 적으면 좋아요.', attrs: 'placeholder="예: 두 개를 샀는데 그중 한 개가 처음부터 켜지지 않아요."'})}
    ${textArea('판매처에 전할 영문 설명 (선택)', 'issueEnglish', value.issueEnglish, {
      hint: '비워 두면 문의 초안을 만들 때 번역해요.',
      attrs: 'lang="en"',
      extra: aiEnabled ? html`<button class="btn small ai" type="button" data-action="translate-issue">${icon('sparkle')}AI로 영문 작성</button>` : '',
    })}
    <div class="full" data-ai-slot="translate"></div>
    <details class="optional-block full" ${value.deadline ? html`open` : ''}>
      <summary>판매처가 정한 기한이 있나요? (선택)</summary>
      <div class="form-grid">
        ${field('판매처 기한', 'deadline', value.deadline, {type: 'date'})}
        ${selectField('기한 시간대', 'deadlineZone', config.deadlineZones.map(zone => [zone, zone]), value.deadlineZone)}
        ${field('기한 근거 (판매처 원문)', 'deadlineQuote', value.deadlineQuote, {full: true, attrs: 'maxlength="1000" placeholder="예: Returns accepted within 30 days of delivery."'})}
      </div>
    </details>
  </div>`;
}

const step = (n, title, lead, body) => html`<section class="wizard-step" data-step="${n}" ${n === 1 ? '' : html`hidden`}>
  <h3 class="step-title" tabindex="-1">${title}</h3>
  ${lead ? html`<p class="step-lead">${lead}</p>` : ''}
  ${body}
</section>`;

function wizard(value, config, aiEnabled) {
  return html`<form id="claim-form" class="wizard" data-mode="create" data-wizard data-step="1" data-key="${newRequestKey()}">
    ${stepperHeader(STEPS)}
    ${step(1, '어떤 주문인가요?', '주문 확인 메일이나 주문 내역을 보면서 채우면 쉬워요.', html`
      ${aiEnabled ? html`<div class="assist-card">
        <span class="assist-icon">${icon('sparkle')}</span>
        <div><strong>주문서로 자동 채우기</strong><p>주문 확인 메일 캡처나 PDF를 고르면 AI가 판매처·주문번호·품목을 읽어 채워요. 그 파일은 증빙으로도 함께 올라가요.</p></div>
        <label class="btn small ai">${icon('upload')}주문서 고르기<input id="wizard-extract-file" type="file" accept="${ACCEPT}" hidden></label>
      </div>
      <div data-ai-slot="extract-doc"></div>
      <div id="extract-result"></div>` : ''}
      ${basicsFields(value, config, 'vendor')}`)}
    ${step(2, '얼마를 돌려받아야 하나요?', '문제가 있는 품목과 금액을 적어 주세요. 금액은 주문할 때의 통화로 적어요.', moneyFields(value, config))}
    ${step(3, '무엇이 문제였나요?', '판매처에 전할 내용이에요. 사실 그대로 적을수록 문의가 쉬워져요.', issueFields(value, config, aiEnabled))}
    ${step(4, '증빙을 올려 주세요', '주문서, 불량 사진, 판매처와 나눈 대화 캡처가 있으면 함께 올려 두세요. 나중에 올려도 돼요.', html`
      <div class="drop" data-drop="wizard-files">
        <span class="drop-icon">${icon('upload')}</span>
        <strong>파일을 여기로 끌어 놓거나 골라 주세요</strong>
        <small>PNG · JPG · WebP · PDF, 파일당 10MB까지</small>
        <div class="actions center">
          <label class="btn small">${icon('file')}파일 선택<input id="wizard-file" type="file" accept="${ACCEPT}" multiple hidden></label>
          <label class="btn small">${icon('camera')}사진 촬영<input id="wizard-capture" type="file" capture="environment" accept="image/jpeg,image/png,image/webp" hidden></label>
        </div>
      </div>
      <ul class="pending-files" id="wizard-file-list"></ul>`)}
    ${step(5, '이대로 등록할까요?', '내용을 확인하고 등록하세요. 등록한 뒤에도 고칠 수 있어요.', html`<div id="wizard-review"></div>`)}
    ${stepperActions('등록하기')}
  </form>`;
}

function editForm(value, config, aiEnabled, {suggestion, focus}) {
  return html`<form id="claim-form" data-mode="edit" data-key="${newRequestKey()}" ${suggestion ? html`data-dirty="true"` : ''}>
    ${suggestion ? aiNote('AI가 문서에서 읽은 값을 채웠어요. 원문과 다르지 않은지 확인한 뒤 저장하세요.') : ''}
    <section class="form-section"><h3>기본 정보</h3>${basicsFields(value, config, focus)}</section>
    <section class="form-section${focus === 'agreedAmount' ? ' is-focus' : ''}"><h3>주문·금액</h3>${moneyFields(value, config, focus)}</section>
    <section class="form-section"><h3>문제 내용</h3>${issueFields(value, config, aiEnabled)}</section>
    ${formActions('저장')}
  </form>`;
}

export function render({mode, suggestion, focus = ''}, {detail, session}) {
  const config = session.config;
  labels = config;
  const value = initialValues(mode, detail.claim, suggestion);
  if (mode === 'create') return {title: '새 클레임 신청', size: 'wizard', body: wizard(value, config, session.ai.enabled)};
  return {title: focus === 'agreedAmount' ? '합의액 입력' : '정보·합의 수정', body: editForm(value, config, session.ai.enabled, {suggestion, focus})};
}

// ---------- Live parts of the form (the dialog is not re-rendered while open) ----------

function readClaimForm(form) {
  const values = formValues(form);
  const items = [...form.querySelectorAll('[data-item]')].map(row =>
    Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.name.replace(/-\d+$/, ''), input.value])));
  const input = {...values, items};
  for (const key of Object.keys(input)) if (/-\d+$/.test(key)) delete input[key];
  return input;
}

// "문제 품목 금액": sum of problem quantity × unit price, offered as the claim amount.
function itemsTotal(items, currency) {
  let total = 0;
  for (const item of items) {
    const qty = Number(item.claimQty);
    const price = parseAmount(item.unitPrice, currency);
    if (Number.isInteger(qty) && qty > 0 && price !== null) total += qty * price;
  }
  return total;
}

function sumMarkup(total, currency, current) {
  if (!total) return '';
  return html`<span>문제 품목 금액 <strong>${money(total, currency)}</strong></span>
    ${current === total ? html`<small>${icon('check')}청구액과 같아요</small>` : html`<button class="btn small" type="button" data-action="use-sum" data-amount="${decimal(total, currency)}">청구액으로 쓰기</button>`}`;
}

function refreshSum(form) {
  const box = form.querySelector('[data-sum]');
  if (!box) return;
  const currency = form.elements.currency.value;
  const items = [...form.querySelectorAll('[data-item]')].map(row => ({
    claimQty: row.querySelector('[name^="claimQty-"]').value,
    unitPrice: row.querySelector('[name^="unitPrice-"]').value,
  }));
  const total = itemsTotal(items, currency);
  const current = parseAmount(form.elements.claimedAmount.value, currency);
  // Leaving a field fires "change" between the press and release of a click on
  // the button; re-rendering an unchanged box then would swallow that click.
  const signature = `${currency}:${total}:${current}`;
  if (box.dataset.signature === signature) return;
  box.dataset.signature = signature;
  renderInto(box, sumMarkup(total, currency, current));
}

function setCurrencyLabels(form) {
  for (const affix of form.querySelectorAll('[data-affix]')) affix.textContent = form.elements.currency.value;
}

function fillItems(form, items) {
  const rows = form.querySelector('#item-rows');
  rows.innerHTML = toMarkup(items.map((item, index) => itemRow({...EMPTY_ITEM, ...item, unitPrice: item.unitPrice ?? ''}, index, form.elements.currency.value)));
}

// Puts what the AI read into the form and marks those inputs until edited.
function applySuggestion(form, suggestion) {
  const filled = [];
  const set = (name, value, label) => {
    if (value === null || value === undefined || value === '') return;
    const input = form.elements.namedItem(name);
    input.value = value;
    input.classList.add('ai-filled');
    filled.push(label);
  };
  set('vendor', suggestion.vendor, '판매처');
  set('orderRef', suggestion.orderRef, '주문번호');
  set('orderedOn', suggestion.orderedOn, '주문일');
  set('currency', suggestion.currency, '통화');
  setCurrencyLabels(form);
  if (suggestion.items?.length) {
    fillItems(form, suggestion.items);
    for (const input of form.querySelectorAll('#item-rows input')) if (input.value) input.classList.add('ai-filled');
    if (!form.elements.title.value) set('title', suggestion.items[0].name, '상품명');
    filled.push(`품목 ${suggestion.items.length}개`);
  }
  refreshSum(form);
  return filled;
}

function renderPending(form) {
  const files = pendingFiles.get(form) ?? [];
  renderInto(form.querySelector('#wizard-file-list'), files.map((file, index) => html`<li class="pending-file">
    <span class="pending-icon">${icon(file.type.startsWith('image/') ? 'image' : 'file')}</span>
    <div><strong>${file.name}</strong><small>${file.type === 'application/pdf' ? 'PDF' : '사진'} · ${fileSize(file.size)}</small></div>
    <button class="btn ghost small" type="button" data-action="wizard-remove-file" data-index="${index}" aria-label="${file.name} 빼기">빼기</button>
  </li>`));
}

// Checks type and size here so the user hears about a wrong file right away.
function addPending(form, files, vms) {
  const {types, maxBytes} = vms.session.state.config.files;
  const list = pendingFiles.get(form) ?? [];
  for (const file of files) {
    if (!types.includes(file.type)) { vms.app.notify(`${file.name}: PNG·JPG·WebP·PDF 파일만 올릴 수 있어요.`); continue; }
    if (file.size > maxBytes) { vms.app.notify(`${file.name}: 10MB 이하 파일만 올릴 수 있어요.`); continue; }
    if (list.some(other => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified)) continue;
    list.push(file);
  }
  pendingFiles.set(form, list);
  if (list.length) form.dataset.dirty = 'true';
  renderPending(form);
}

function renderReview(form) {
  const v = readClaimForm(form);
  const files = pendingFiles.get(form) ?? [];
  const amount = text => {
    const minor = parseAmount(text, v.currency);
    return minor === null ? (text || '없음') : money(minor, v.currency);
  };
  const row = (label, value, goTo) => html`<div><dt>${label}</dt><dd>${value}</dd>
    <button class="btn ghost small" type="button" data-action="wizard-go" data-step="${goTo}" aria-label="${label} 고치기">고치기</button></div>`;
  renderInto(form.querySelector('#wizard-review'), html`<dl class="review-list">
    ${row('판매처', v.vendor, 1)}
    ${row('상품명', v.title, 1)}
    ${row('주문', `${v.orderRef} · ${v.orderedOn}`, 1)}
    ${row('처리 방식', labels?.claimKinds[v.kind] ?? v.kind, 1)}
    ${row('청구액', amount(v.claimedAmount), 2)}
    ${v.agreedAmount ? row('합의액', amount(v.agreedAmount), 2) : ''}
    ${row('품목', v.items.map(item => `${item.name} × ${item.claimQty}`).join(', '), 2)}
    ${row('문제 설명', v.issue.length > 120 ? `${v.issue.slice(0, 120)}…` : v.issue, 3)}
    ${row('증빙', files.length ? `${files.length}개 · ${files.map(file => file.name).join(', ')}` : '아직 없음 (나중에 올려도 돼요)', 4)}
  </dl>
  <p class="review-next">${icon('arrow')}등록하면 ${files.length ? '판매처에 보낼 문의를 준비할 수 있어요.' : '증빙을 올리고 문의를 준비하면 돼요.'}</p>`);
}

onStepEnter('claim-form', (form, n) => {
  if (n === 5) renderReview(form);
  if (n === 2) refreshSum(form);
});

export const handlers = {
  click: {
    'add-item': ({el}) => {
      const form = el.closest('form');
      const rows = form.querySelector('#item-rows');
      rows.insertAdjacentHTML('beforeend', toMarkup(itemRow(EMPTY_ITEM, rows.querySelectorAll('[data-item]').length, form.elements.currency.value)));
      rows.querySelector('[data-item]:last-child input')?.focus();
    },
    'remove-item': ({el}) => {
      const form = el.closest('form');
      el.closest('[data-item]').remove();
      refreshSum(form);
    },
    'use-sum': ({el}) => {
      const form = el.closest('form');
      form.elements.claimedAmount.value = el.dataset.amount;
      form.dataset.dirty = 'true';
      refreshSum(form);
    },
    'translate-issue': ({el, vms}) => vms.ai.ensureConsent(async () => {
      const form = el.closest('form');
      const {english} = await vms.ai.translateIssue(form.elements.issue.value);
      form.elements.issueEnglish.value = english;
      form.elements.issueEnglish.classList.add('ai-filled');
      form.dataset.dirty = 'true';
      vms.app.notify('영문 설명을 채웠어요. 내용을 확인해 주세요.');
    }),
    'wizard-remove-file': ({el}) => {
      const form = el.closest('form');
      pendingFiles.get(form)?.splice(Number(el.dataset.index), 1);
      renderPending(form);
    },
  },
  change: {
    'wizard-file': ({el, vms}) => { addPending(el.form, [...el.files], vms); el.value = ''; },
    'wizard-capture': ({el, vms}) => { addPending(el.form, [...el.files], vms); el.value = ''; },
    'wizard-extract-file': ({el, vms}) => {
      const form = el.form;
      const file = el.files[0];
      el.value = '';
      if (!file) return null;
      return vms.ai.ensureConsent(async () => {
        const result = await vms.ai.extractDocument(file);
        const filled = applySuggestion(form, result.suggestion);
        addPending(form, [file], vms);
        form.dataset.dirty = 'true';
        renderInto(form.querySelector('#extract-result'), aiNote(filled.length
          ? html`<strong>${result.source.name}</strong>에서 읽어 채운 항목: ${filled.join(' · ')}. 보라색 칸이 원문과 맞는지 확인하세요.${result.orderTotal ? html` (주문 합계 ${result.suggestion.currency ?? ''} ${result.orderTotal})` : ''}`
          : html`<strong>${result.source.name}</strong>에서 주문 정보를 찾지 못했어요. 직접 입력해 주세요. 파일은 증빙으로 올려 둘게요.`));
      });
    },
    // Any change in the claim form: currency labels and the item sum follow along.
    'form:claim-form': ({el}) => {
      if (el.name === 'currency') setCurrencyLabels(el.form);
      refreshSum(el.form);
    },
  },
  input: {
    'form:claim-form': ({el}) => {
      el.classList.remove('ai-filled');
      if (/^(unitPrice|claimQty)-\d+$|^claimedAmount$/.test(el.name)) refreshSum(el.form);
    },
  },
  drop: {
    'wizard-files': ({el, files, vms}) => addPending(el.closest('form'), files, vms),
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
      const {claim, failed} = await vms.list.create(input, form.dataset.key, pendingFiles.get(form) ?? []);
      vms.app.closeDialog();
      await vms.app.go({name: 'claim', id: claim.id, tab: claim.files.length && !failed.length ? 'overview' : 'files'});
      if (failed.length) vms.app.notify(`클레임을 등록했어요. 파일 ${failed.length}개는 올리지 못했어요: ${failed.map(file => file.name).join(', ')}. 다시 올려 주세요.`);
      else if (claim.files.length) vms.app.notify('클레임을 등록했어요. 다음 할 일을 확인하세요.');
      else vms.app.notify('클레임을 등록했어요. 주문 내역이나 불량 사진을 올려 주세요.');
    },
  },
};
