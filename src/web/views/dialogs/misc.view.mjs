import {html} from '../../core/html.mjs';
import {formActions} from '../components/ui.view.mjs';
import {AI_CONSENT_TEXT} from '../pages/settings.view.mjs';

const TRANSITION_TEXT = {
  awaiting: '판매처 답변을 기다리는 중으로 바꿔요.',
  negotiating: '판매처와 조건을 맞춰 가는 중으로 바꿔요.',
  disputed: '판매처가 거절했거나 의견이 달라 분쟁으로 기록해요.',
  waived: '포기로 기록해요. 회수 기록과 이력은 그대로 남아요.',
  reopen: '지난 기록을 그대로 두고 다시 진행해요.',
  close: '실제로 받은 결과를 확인하고 종료해요.',
};

export const renderTransition = ({action}) => ({
  title: '상태 변경',
  body: html`<form id="transition-form">
    <input type="hidden" name="action" value="${action}">
    <div class="notice">${TRANSITION_TEXT[action]}</div>
    <div class="field full"><label for="reason">변경 사유</label><textarea id="reason" name="reason" required minlength="3" maxlength="2000"></textarea></div>
    ${formActions('변경')}
  </form>`,
});

export const renderTrash = () => ({
  title: '휴지통으로 이동',
  body: html`<form id="trash-form">
    <div class="notice warning">목록에서 숨기고 휴지통으로 옮겨요. 증빙과 회수 기록은 남아 있고 언제든 복원할 수 있어요.</div>
    <div class="field full"><label for="trash-reason">사유 (선택)</label><textarea id="trash-reason" name="reason" maxlength="500"></textarea></div>
    ${formActions('휴지통으로 이동')}
  </form>`,
});

export const renderConfirm = ({title, message, confirmLabel}) => ({
  title,
  body: html`<p>${message}</p>
    <div class="form-actions">
      <button class="btn" type="button" data-action="close-dialog">취소</button>
      <button class="btn danger-fill" type="button" data-action="confirm-dialog">${confirmLabel}</button>
    </div>`,
});

export const renderImage = ({url, name}) => ({
  title: name,
  body: html`<img class="evidence-image" src="${url}" alt="${name}"><div class="actions"><a class="btn" href="${url}" download="${name}">다운로드</a></div>`,
});

export const renderAiConsent = () => ({
  title: 'AI 처리 동의',
  body: html`<div class="consent">${AI_CONSENT_TEXT}</div>
    <div class="form-actions">
      <button class="btn" type="button" data-action="close-overlay">동의하지 않음</button>
      <button class="btn primary" type="button" data-action="agree-ai">동의하고 계속</button>
    </div>`,
});

const FIELD_LABELS = {vendor: '판매처', orderRef: '주문번호', orderedOn: '주문일', currency: '통화', total: '합계', item: '품목'};

export const renderExtraction = ({result}) => ({
  title: 'AI가 읽은 주문 정보',
  body: html`
    <div class="ai-note">${result.source.name}에서 읽은 값이에요 (${result.model}). 원문 인용과 다르면 반영하지 마세요.</div>
    ${result.fields.length ? html`<div class="source-grid">${result.fields.map(item => html`<div class="source">
      <strong>${FIELD_LABELS[item.field]}: ${item.value}</strong>
      ${item.quote ? html`<blockquote>${item.quote}</blockquote>` : ''}
    </div>`)}</div>` : html`<p class="muted">문서에서 읽을 수 있는 주문 정보를 찾지 못했어요.</p>`}
    <div class="form-actions">
      <button class="btn" type="button" data-action="close-dialog">닫기</button>
      ${result.fields.length ? html`<button class="btn primary" type="button" data-action="apply-extraction">사건 정보에 반영</button>` : ''}
    </div>`,
});

export const handlers = {
  click: {
    'confirm-dialog': async ({vms}) => {
      await vms.app.state.dialog.props.run();
      vms.app.closeDialog();
    },
    'agree-ai': ({vms}) => vms.ai.agree(vms.app.state.overlay.props.onAgree),
    'apply-extraction': ({vms}) => vms.app.openDialog('claim-form', {mode: 'edit', suggestion: vms.app.state.dialog.props.result.suggestion}),
  },
  submit: {
    'transition-form': async ({values, vms}) => {
      await vms.detail.transition(values.action, values.reason);
      vms.app.closeDialog();
      vms.app.notify('상태를 바꿨어요.');
    },
    'trash-form': async ({values, vms}) => {
      await vms.detail.moveToTrash(values.reason);
      vms.app.closeDialog();
      await vms.app.go({name: 'dashboard'});
      vms.app.notify('휴지통으로 옮겼어요.');
    },
  },
};
