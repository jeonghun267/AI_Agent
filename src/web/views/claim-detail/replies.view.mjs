import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {emptyState} from '../components/ui.view.mjs';

export function render(claim, {session}) {
  const kinds = session.config.replyKinds;
  const canRecord = !claim.deleted && !['waived', 'completed'].includes(claim.state);
  return html`
    <div class="section-title"><div><h2>판매처 답변</h2><p class="muted">받은 답변 원문을 붙여 넣어 기록하세요. 환불 통지만으로는 입금으로 보지 않아요.</p></div>
      ${canRecord ? html`<button class="btn primary small" type="button" data-action="record-reply">답변 기록</button>` : ''}</div>
    ${claim.replies.length ? claim.replies.map(reply => html`<article class="reply-card">
      <header><strong>${kinds[reply.kind]}</strong><small>${dateTime(reply.recordedAt)}${reply.aiAssisted ? ' · AI 번역 참고' : ''}</small></header>
      ${reply.summaryKo ? html`<p>${reply.summaryKo}</p>` : ''}
      <details ${reply.translationKo ? '' : html`open`}><summary>원문</summary><pre>${reply.body}</pre></details>
      ${reply.translationKo ? html`<details open><summary>한국어 번역 (AI)</summary><pre>${reply.translationKo}</pre></details>` : ''}
    </article>`) : emptyState('아직 기록한 답변이 없어요')}`;
}

export const handlers = {
  click: {
    'record-reply': ({vms}) => vms.app.openDialog('reply'),
  },
};
