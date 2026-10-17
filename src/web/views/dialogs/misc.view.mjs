import {html} from '../../core/html.mjs';
import {formActions} from '../components/ui.view.mjs';
import {doriFigure} from '../components/dori.view.mjs';
import {icon} from '../components/icons.view.mjs';
import {money, shortDate, today} from '../../core/format.mjs';
import {AI_CONSENT_TEXT} from '../pages/settings.view.mjs';

const TRANSITION_TEXT = {
  awaiting: '판매처 답변을 기다리는 중으로 바꿔요.',
  negotiating: '판매처와 조건을 맞춰 가는 중으로 바꿔요.',
  disputed: '판매처가 거절했거나 의견이 달라 분쟁으로 기록해요.',
  waived: '포기로 기록해요. 회수 기록과 이력은 그대로 남아요.',
  reopen: '지난 기록을 그대로 두고 다시 진행해요.',
  close: '실제로 받은 결과를 확인하고 종료해요.',
};
const TRANSITION_TITLE = {close: '클레임 종료', reopen: '다시 진행', waived: '포기로 기록', disputed: '분쟁으로 기록'};

export const renderTransition = ({action}) => ({
  title: TRANSITION_TITLE[action] ?? '상태 변경',
  body: html`<form id="transition-form">
    <input type="hidden" name="action" value="${action}">
    <div class="notice${['waived', 'disputed'].includes(action) ? ' warning' : ''}">${TRANSITION_TEXT[action]}</div>
    <div class="field full"><label for="reason">변경 사유</label><textarea id="reason" name="reason" required minlength="3" maxlength="2000">${action === 'close' ? '실제 회수를 확인하고 종료해요.' : ''}</textarea></div>
    ${formActions(action === 'close' ? '종료하기' : '변경')}
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
  body: html`<img class="evidence-image" src="${url}" alt="${name}"><div class="actions"><a class="btn" href="${url}" download="${name}">${icon('download')}다운로드</a></div>`,
});

const CELEBRATE_TEXT = {refund: '전액 회수가 완료됐어요', exchange: '교환품을 모두 받았어요', repair: '수리 결과까지 확인했어요'};

// The one celebration (DESIGN.md §8): calm and clear, money first.
export const renderCelebrate = ({claim}) => ({
  title: '회수 완료',
  body: html`<div class="celebrate">
    ${doriFigure({pose: 'celebrating', size: 'lg'})}
    <h3>${CELEBRATE_TEXT[claim.kind]}</h3>
    ${claim.kind === 'refund' ? html`<strong class="celebrate-amount">${money(claim.summary.cash, claim.currency)}</strong>` : ''}
    <dl class="celebrate-facts">
      <div><dt>클레임</dt><dd>${claim.title}</dd></div>
      <div><dt>판매처</dt><dd>${claim.vendor}</dd></div>
      <div><dt>확인한 날</dt><dd>${shortDate(today())}</dd></div>
    </dl>
    <p>받은 내용을 한 번 더 확인했다면 이 건을 종료하세요. 기록은 그대로 남아요.</p>
    <div class="celebrate-actions">
      <button class="btn" type="button" data-action="close-dialog">상세로 돌아가기</button>
      <button class="btn primary" type="button" data-action="celebrate-close">${icon('check')}클레임 종료하기</button>
    </div>
  </div>`,
});

export const renderDiscard = () => ({
  title: '작성 중인 내용이 있어요',
  body: html`<p>창을 닫으면 지금 입력한 내용이 사라져요.</p>
    <div class="form-actions">
      <button class="btn" type="button" data-action="close-overlay">계속 작성</button>
      <button class="btn danger-fill" type="button" data-action="discard-dialog">버리고 닫기</button>
    </div>`,
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
    <section class="ai-card">
      <header>${icon('sparkle')}<strong>${result.source.name}</strong><span class="tag ai">미리보기</span></header>
      <p class="ai-card-summary">AI(${result.model})가 문서에서 읽은 값이에요. 아래 원문 인용과 다르면 반영하지 마세요.</p>
      ${result.fields.length ? html`<div class="source-grid">${result.fields.map(item => html`<div class="source">
        <strong>${FIELD_LABELS[item.field]}: ${item.value}</strong>
        ${item.quote ? html`<blockquote>${item.quote}</blockquote>` : ''}
      </div>`)}</div>` : html`<p class="muted">문서에서 읽을 수 있는 주문 정보를 찾지 못했어요.</p>`}
    </section>
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
    'celebrate-close': ({vms}) => vms.app.openDialog('transition', {action: 'close'}),
  },
  submit: {
    'transition-form': async ({values, vms}) => {
      await vms.detail.transition(values.action, values.reason);
      vms.app.closeDialog();
      vms.app.notify(values.action === 'close' ? '클레임을 종료했어요. 기록은 그대로 남아요.' : '상태를 바꿨어요.');
    },
    'trash-form': async ({values, vms}) => {
      await vms.detail.moveToTrash(values.reason);
      vms.app.closeDialog();
      await vms.app.go({name: 'claims'});
      vms.app.notify('휴지통으로 옮겼어요.');
    },
  },
};
