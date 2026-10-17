import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {emptyState} from '../components/ui.view.mjs';
import {icon} from '../components/icons.view.mjs';

export function render(claim, {session}) {
  const kinds = session.config.replyKinds;
  const canRecord = !claim.deleted && !['waived', 'completed'].includes(claim.state);
  return html`
    <div class="section-title"><div><h2>판매처 답변</h2><p class="muted">받은 답변 원문을 붙여 넣어 기록하세요. 환불했다는 통지만으로는 입금으로 보지 않아요.</p></div>
      ${canRecord ? html`<button class="btn small" type="button" data-action="record-reply">${icon('reply')}새 답변 기록</button>` : ''}</div>
    ${claim.replies.length ? html`<div class="stack">${claim.replies.map(reply => html`<article class="reply-card kind-${reply.kind}">
      <header>
        <span class="tag reply-${reply.kind}">${kinds[reply.kind] ?? reply.kind}</span>
        <small>${dateTime(reply.recordedAt)}</small>
      </header>
      ${reply.summaryKo ? html`<div class="ai-summary">${icon('sparkle')}<p><span class="visually-hidden">AI 요약: </span>${reply.summaryKo}</p></div>` : ''}
      <details ${reply.translationKo ? '' : html`open`}><summary>받은 원문</summary><pre lang="en">${reply.body}</pre></details>
      ${reply.translationKo ? html`<details open><summary>한국어 번역 (AI 참고)</summary><pre>${reply.translationKo}</pre></details>` : ''}
    </article>`)}</div>` : emptyState('아직 기록한 답변이 없어요', '판매처에서 메일이나 채팅 답변이 오면 원문을 그대로 붙여 넣어 주세요.', {compact: true})}`;
}

export const handlers = {
  click: {
    'record-reply': ({vms}) => vms.app.openDialog('reply'),
  },
};
