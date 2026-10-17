import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {icon} from './icons.view.mjs';

// Icon for an activity: feed items carry a kind; change-history events carry
// the action text the server wrote ("증빙 저장", "상태 변경 · disputed", ...).
const KIND_ICON = {create: 'plus', file: 'upload', draft: 'edit', sent: 'send', reply: 'reply', receipt: 'coin', reversal: 'undo'};
const ACTION_ICON = [
  ['사건 등록', 'plus'], ['사건 정보 수정', 'edit'], ['상태 변경', 'flag'], ['휴지통으로', 'trash'], ['복원', 'restore'],
  ['문의 버전', 'edit'], ['보낸 사실', 'send'], ['증빙 저장', 'upload'], ['증빙 삭제', 'trash'],
  ['판매처 답변', 'reply'], ['실제 회수', 'coin'], ['정정', 'undo'],
];

export const iconForAction = action => ACTION_ICON.find(([prefix]) => action.includes(prefix))?.[1] ?? 'clock';

// items: [{at, text, kind?, claimId?, claimTitle?}]. withClaim names the claim
// under each item (the home feed mixes claims).
export function activityList(items, {withClaim = false} = {}) {
  return html`<ol class="timeline">
    ${items.map(item => html`<li class="timeline-item">
      <span class="timeline-icon">${icon(KIND_ICON[item.kind] ?? iconForAction(item.text))}</span>
      <div class="timeline-body">
        <p>${item.text}</p>
        <small>${withClaim ? html`<a href="#/claims/${item.claimId}">${item.claimTitle}</a> · ` : ''}<time datetime="${item.at}">${dateTime(item.at)}</time></small>
      </div>
    </li>`)}
  </ol>`;
}
