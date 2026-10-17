import {html} from '../../core/html.mjs';
import {money} from '../../core/format.mjs';
import {selectNextAction, selectRecovery} from '../../viewmodels/claim-progress.mjs';
import {statePill} from './ui.view.mjs';
import {icon} from './icons.view.mjs';
import {prepareDraft} from '../claim-detail/inquiry.view.mjs';
import {uploadEvidence, ACCEPT} from '../claim-detail/files.view.mjs';

// "다음 할 일" (DESIGN.md §7 "행동 카드"): the one thing that moves a claim
// forward, with the button that does it. The key comes from selectNextAction;
// the buttons reuse the actions of the claim tabs, so they behave the same.

const button = (label, action, {primary = true, data = '', iconName = ''} = {}) =>
  html`<button class="btn${primary ? ' primary' : ''}" type="button" data-action="${action}" ${data}>${iconName ? icon(iconName) : ''}${label}</button>`;

// A label wrapping a file input, so a single tap opens the file picker.
const uploadButton = (label, {primary = true} = {}) =>
  html`<label class="btn${primary ? ' primary' : ''}">${icon('upload')}${label}<input id="next-upload-file" type="file" accept="${ACCEPT}" hidden></label>`;

function buttons(next, claim, {aiEnabled}) {
  const draft = (label, ai) => button(label, 'prepare-draft', {data: html`data-ai="${ai ? 1 : 0}"`, primary: true, iconName: ai ? 'sparkle' : 'edit'});
  switch (next.key) {
    case 'restore': return button('복원하기', 'restore-current', {iconName: 'restore'});
    case 'done': return html`<a class="btn" href="#/claims/${claim.id}/ledger">회수 기록 보기</a>`;
    case 'reopen': return button('사유 남기고 다시 진행', 'transition', {data: html`data-transition="reopen"`, primary: false});
    case 'close': return button('결과 확인하고 종료', 'transition', {data: html`data-transition="close"`, iconName: 'check'});
    case 'dispute': return html`${draft('근거를 보강해 다시 문의', aiEnabled)}${button('새 답변 기록', 'record-reply', {primary: false})}`;
    case 'upload': return uploadButton('증빙 올리기');
    case 'evidence': return html`${uploadButton('요청받은 증빙 올리기')}${button('새 문의 준비', 'prepare-draft', {primary: false, data: html`data-ai="${aiEnabled ? 1 : 0}"`})}`;
    case 'draft': return html`${draft(aiEnabled ? 'AI로 문의 초안 만들기' : '문의 초안 만들기', aiEnabled)}${aiEnabled ? button('기본 틀로 시작', 'prepare-draft', {primary: false, data: html`data-ai="0"`}) : ''}`;
    case 'stale': return button('수정 버전 작성', 'edit-draft', {iconName: 'edit'});
    case 'submit': return html`${button('보냈어요 기록하기', 'submit-draft', {iconName: 'send'})}${button('문의 복사', 'copy-draft', {primary: false, iconName: 'copy'})}`;
    case 'reply': return button('답변 기록하기', 'record-reply', {iconName: 'reply'});
    case 'agree': return button('합의액 입력하기', 'edit-claim', {data: html`data-focus="agreedAmount"`, iconName: 'edit'});
    case 'receipt': return button('회수 기록하기', 'record-receipt', {iconName: 'coin'});
    default: return '';
  }
}

// Claim detail: the card at the top of the side column (above the tabs on phones).
export function nextActionCard(claim, {session, draft}) {
  const next = selectNextAction(claim, {aiEnabled: session.ai.enabled});
  return html`<section class="next-card tone-${next.tone}" aria-labelledby="next-title">
    <p class="next-eyebrow">${icon(next.tone === 'done' ? 'check' : next.tone === 'attention' ? 'alert' : 'arrow')}다음 할 일</p>
    <h2 id="next-title">${next.title}</h2>
    <p>${next.body}</p>
    <div class="next-actions${draft.preparing ? ' is-busy' : ''}">${buttons(next, claim, {aiEnabled: session.ai.enabled})}</div>
  </section>`;
}

const TODO_LABEL = {
  close: '종료하기', dispute: '다시 문의하기', receipt: '회수 기록하기', agree: '합의액 입력하기', evidence: '증빙 올리기',
  submit: '보냈어요 기록', stale: '문의 고치기', draft: '문의 초안 만들기', upload: '증빙 올리기', reply: '답변 기록하기',
};

function remainingLine(claim) {
  const recovery = selectRecovery(claim);
  if (claim.kind === 'refund') return `남은 금액 ${money(claim.summary.remaining, claim.currency)} · 회수율 ${recovery.percent}%`;
  if (claim.kind === 'exchange') return `교환품 ${recovery.got}/${recovery.target}개 받음`;
  return recovery.got ? '수리 결과 확인함' : '수리 결과 기다리는 중';
}

// Home: one row per claim that needs the user, with a button that opens the
// claim on the right tab and starts the action.
export function todoItem({claim, next}, labels) {
  return html`<li class="todo-item tone-${next.tone}">
    <div class="todo-main">
      <p class="todo-claim"><a href="#/claims/${claim.id}${next.tab === 'overview' ? '' : `/${next.tab}`}">${claim.title}</a><span>${claim.vendor}</span></p>
      <h3>${next.title}</h3>
      <p class="todo-meta">${statePill(claim.state, labels.states)}<span>${remainingLine(claim)}</span></p>
    </div>
    <button class="btn small" type="button" data-action="run-next" data-id="${claim.id}" data-key="${next.key}" data-tab="${next.tab}">${TODO_LABEL[next.key]}</button>
  </li>`;
}

// What "run-next" does once the claim is open. Upload steps stop at the files tab.
const RUN = {
  close: vms => vms.app.openDialog('transition', {action: 'close'}),
  dispute: vms => prepareDraft(vms, vms.session.state.ai.enabled),
  receipt: vms => vms.app.openDialog('receipt', {reverses: null}),
  agree: vms => vms.app.openDialog('claim-form', {mode: 'edit', focus: 'agreedAmount'}),
  submit: vms => vms.app.openDialog('submit-draft'),
  stale: vms => vms.draft.editLatest(),
  draft: vms => prepareDraft(vms, vms.session.state.ai.enabled),
  reply: vms => vms.app.openDialog('reply'),
};

export const handlers = {
  click: {
    'run-next': async ({el, vms}) => {
      const {id, key, tab} = el.dataset;
      await vms.app.go({name: 'claim', id, tab});
      if (vms.detail.state.claim?.id === id) await RUN[key]?.(vms);
    },
  },
  change: {
    'next-upload-file': ({el, vms}) => uploadEvidence(el.files[0], vms),
  },
};
