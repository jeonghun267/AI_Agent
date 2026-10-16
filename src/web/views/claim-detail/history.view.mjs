import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';

export function render(claim) {
  return html`
    <div class="section-title"><h2>변경 이력</h2><small>${claim.events.length}개 기록</small></div>
    ${claim.events.map(event => html`<article class="item-card">
      <header><strong>${event.action}</strong><small>${dateTime(event.createdAt)}</small></header>
      <details><summary>바뀐 내용 보기</summary><pre class="email-preview">${JSON.stringify({before: event.before, after: event.after}, null, 2)}</pre></details>
    </article>`)}
    <p class="status-line">이력은 추가만 되고 수정·삭제되지 않아요.</p>`;
}

export const handlers = {};
