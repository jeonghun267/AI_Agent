import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {emptyState} from '../components/ui.view.mjs';

const ORIGIN = {ai: 'AI 초안에서 시작', template: '기본 틀에서 시작', manual: '직접 작성'};

function draftStatus(draft, count) {
  if (draft.stale) return html`<div class="notice warning"><span>버전 ${count} · 사건 정보나 증빙이 바뀌었어요. 새 버전을 저장한 뒤 보내세요.</span></div>`;
  if (draft.submittedAt) return html`<div class="notice"><span>버전 ${count} · ${dateTime(draft.submittedAt)}에 보냈다고 기록함${draft.submissionNote ? ` · ${draft.submissionNote}` : ''}</span></div>`;
  return html`<div class="notice"><span>버전 ${count} · ${ORIGIN[draft.origin]}${draft.model ? ` (${draft.model})` : ''} · ${dateTime(draft.createdAt)} 저장</span></div>`;
}

export function render(claim, {session, draft: draftState}) {
  const latest = claim.drafts[0];
  const canEdit = !claim.deleted && !['waived', 'completed'].includes(claim.state);
  return html`
    <div class="section-title"><div><h2>판매처에 보낼 문의</h2><p class="muted">초안을 고치고 버전으로 저장한 뒤, 판매처 문의 창구에 직접 보내고 기록하세요.</p></div></div>
    ${canEdit ? html`<div class="actions">
      ${session.ai.enabled ? html`<button class="btn primary" type="button" data-action="prepare-draft" data-ai="1" ${draftState.preparing ? html`disabled` : ''}>AI로 문의 초안 만들기</button>` : ''}
      <button class="btn${session.ai.enabled ? '' : ' primary'}" type="button" data-action="prepare-draft" data-ai="0" ${draftState.preparing ? html`disabled` : ''}>기본 틀로 시작</button>
    </div>` : ''}
    ${latest ? html`
      ${draftStatus(latest, claim.drafts.length)}
      <pre class="email-preview" lang="en">${latest.body}</pre>
      <div class="actions">
        ${canEdit ? html`<button class="btn" type="button" data-action="edit-draft">수정 버전 작성</button>` : ''}
        <button class="btn" type="button" data-action="copy-draft">복사</button>
        ${canEdit && !latest.stale && !latest.submittedAt ? html`<button class="btn primary" type="button" data-action="submit-draft">판매처에 보냈어요</button>` : ''}
      </div>
      ${claim.drafts.length > 1 ? html`<details class="versions"><summary>이전 버전 ${claim.drafts.length - 1}개</summary>
        ${claim.drafts.slice(1).map((draft, index) => html`<article class="history-card">
          <header><strong>버전 ${claim.drafts.length - 1 - index}</strong><small>${dateTime(draft.createdAt)}${draft.submittedAt ? ' · 보냄' : ''}</small></header>
          <pre class="email-preview" lang="en">${draft.body}</pre></article>`)}
      </details>` : ''}`
    : emptyState('아직 저장한 문의가 없어요', '초안을 만든 뒤 내용을 확인하고 저장하세요.')}
    <p class="status-line">ReLo는 판매처에 메일을 보내지 않아요. 복사한 내용을 판매처의 공식 문의 창구에 직접 보내 주세요.</p>`;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const handlers = {
  click: {
    'prepare-draft': ({el, vms}) => {
      const useAi = el.dataset.ai === '1';
      const start = () => vms.draft.prepare({useAi, reducedMotion: reducedMotion()});
      return useAi ? vms.ai.ensureConsent(start) : start();
    },
    'cancel-draft': ({vms}) => {
      vms.draft.cancel();
      vms.app.closeDialog();
    },
    'edit-draft': ({vms}) => vms.draft.editLatest(),
    'copy-draft': async ({vms}) => {
      await navigator.clipboard.writeText(vms.detail.state.claim.drafts[0].body);
      vms.app.notify('문의 내용을 복사했어요. 판매처 문의 창구에 붙여 넣으세요.');
    },
    'submit-draft': ({vms}) => vms.app.openDialog('submit-draft'),
  },
};
