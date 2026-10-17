import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {emptyState} from '../components/ui.view.mjs';
import {icon} from '../components/icons.view.mjs';

const ORIGIN = {ai: 'AI 초안에서 시작', template: '기본 틀에서 시작', manual: '직접 작성'};

// Saved drafts start with "Subject: …" followed by a blank line.
export function splitSubject(body) {
  const match = /^Subject:[ \t]*(.*)\r?\n(?:\r?\n)?/.exec(body);
  return match ? {subject: match[1], text: body.slice(match[0].length)} : {subject: '', text: body};
}

function status(draft, number) {
  if (draft.submittedAt) return html`<span class="tag sent">${icon('send')}버전 ${number} · 보냄</span>`;
  if (draft.stale) return html`<span class="tag warning">${icon('alert')}버전 ${number} · 다시 써야 해요</span>`;
  return html`<span class="tag current">버전 ${number} · 보내기 전</span>`;
}

// The latest draft as the message it will become: subject, body, state.
function messageCard(draft, claim, canEdit) {
  const {subject, text} = splitSubject(draft.body);
  return html`<article class="message-card${draft.stale && !draft.submittedAt ? ' is-stale' : ''}">
    <header class="message-head">
      ${status(draft, claim.drafts.length)}
      <small>${ORIGIN[draft.origin]}${draft.model ? ` (${draft.model})` : ''} · ${dateTime(draft.createdAt)} 저장</small>
    </header>
    ${draft.stale && !draft.submittedAt ? html`<div class="notice warning"><span>저장한 뒤 사건 정보나 증빙이 바뀌었어요. 새 버전으로 고쳐 저장한 뒤 보내세요.</span></div>` : ''}
    ${draft.submittedAt ? html`<p class="message-sent">${dateTime(draft.submittedAt)}에 보냈다고 기록함${draft.submissionNote ? ` · ${draft.submissionNote}` : ''}</p>` : ''}
    ${subject ? html`<div class="message-subject"><span>제목</span><strong lang="en">${subject}</strong></div>` : ''}
    <pre class="email-preview" lang="en">${text}</pre>
    <div class="actions">
      <button class="btn" type="button" data-action="copy-draft">${icon('copy')}복사</button>
      ${canEdit ? html`<button class="btn" type="button" data-action="edit-draft">${icon('edit')}수정 버전 작성</button>` : ''}
      ${canEdit && !draft.stale && !draft.submittedAt ? html`<button class="btn" type="button" data-action="submit-draft">${icon('send')}판매처에 보냈어요</button>` : ''}
    </div>
  </article>`;
}

export function render(claim, {session, draft: draftState}) {
  const latest = claim.drafts[0];
  const canEdit = !claim.deleted && !['waived', 'completed'].includes(claim.state);
  const busy = draftState.preparing ? html`disabled` : '';
  return html`
    <div class="section-title"><div><h2>판매처에 보낼 문의</h2><p class="muted">초안을 고쳐 버전으로 저장하고, 판매처 문의 창구에 직접 보낸 뒤 기록하세요.</p></div></div>
    <div class="compose-to">
      <span class="compose-label">받는 곳</span>
      <strong>${claim.vendor}</strong>
      <span class="muted">주문 ${claim.orderRef}</span>
      ${claim.vendorUrl ? html`<a class="btn small ghost" href="${claim.vendorUrl}" target="_blank" rel="noopener noreferrer">${icon('external')}판매처 사이트</a>` : ''}
    </div>
    ${canEdit ? html`<div class="compose-tools">
      ${session.ai.enabled ? html`<button class="btn ai" type="button" data-action="prepare-draft" data-ai="1" ${busy}>${icon('sparkle')}AI로 ${latest ? '새 ' : ''}초안 만들기</button>` : ''}
      <button class="btn" type="button" data-action="prepare-draft" data-ai="0" ${busy}>${icon('file')}기본 틀로 시작</button>
      <button class="btn ghost" type="button" data-action="write-draft" ${busy}>${icon('edit')}직접 작성</button>
    </div>` : ''}
    ${latest ? messageCard(latest, claim, canEdit) : emptyState('아직 저장한 문의가 없어요', '초안을 만든 뒤 내용을 확인하고 저장하세요.', {compact: true})}
    ${claim.drafts.length > 1 ? html`<details class="versions"><summary>이전 버전 ${claim.drafts.length - 1}개</summary>
      ${claim.drafts.slice(1).map((draft, index) => html`<article class="item-card">
        <header><strong>버전 ${claim.drafts.length - 1 - index}</strong><small>${dateTime(draft.createdAt)}${draft.submittedAt ? ' · 보냄' : ''}</small></header>
        <pre class="email-preview" lang="en">${draft.body}</pre></article>`)}
    </details>` : ''}
    <p class="status-line">${icon('lock')}ReLo는 판매처에 메일을 보내지 않아요. 복사한 내용을 판매처의 공식 문의 창구에 직접 보내 주세요.</p>`;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Starts preparing a draft (Dori shows meanwhile). AI asks for consent first.
export function prepareDraft(vms, useAi) {
  const start = () => vms.draft.prepare({useAi, reducedMotion: reducedMotion()});
  return useAi ? vms.ai.ensureConsent(start) : start();
}

export const handlers = {
  click: {
    'prepare-draft': ({el, vms}) => prepareDraft(vms, el.dataset.ai === '1'),
    'cancel-draft': ({vms}) => {
      vms.draft.cancel();
      vms.app.closeDialog();
    },
    'edit-draft': ({vms}) => vms.draft.editLatest(),
    'write-draft': ({vms}) => vms.draft.writeManually(),
    'copy-draft': async ({vms}) => {
      await navigator.clipboard.writeText(vms.detail.state.claim.drafts[0].body);
      vms.app.notify('문의 내용을 복사했어요. 판매처 문의 창구에 붙여 넣으세요.');
    },
    'submit-draft': ({vms}) => vms.app.openDialog('submit-draft'),
  },
};
