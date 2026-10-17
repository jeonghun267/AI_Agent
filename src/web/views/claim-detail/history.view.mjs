import {html} from '../../core/html.mjs';
import {dateTime, money} from '../../core/format.mjs';
import {icon} from '../components/icons.view.mjs';
import {iconForAction} from '../components/timeline.view.mjs';

const FIELDS = {
  title: '상품명', vendor: '판매처', vendorUrl: '판매처 주소', orderRef: '주문번호', orderedOn: '주문일', kind: '요청',
  currency: '통화', claimed: '청구액', agreed: '합의액', issue: '문제 설명', issueEnglish: '영문 설명',
  deadline: '판매처 기한', deadlineQuote: '기한 근거', items: '품목', state: '상태',
};

function show(key, value, currency, labels) {
  if (value === null || value === undefined || value === '') return '없음';
  if (key === 'claimed' || key === 'agreed') return money(value, currency);
  if (key === 'kind') return labels.claimKinds[value] ?? value;
  if (key === 'state') return labels.states[value] ?? value;
  if (key === 'items') return `${value.length}개 품목`;
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

// What changed, in words: "합의액: 없음 → €39.90". Claim snapshots are compared
// field by field; file events name the file.
export function describeChanges(event, labels) {
  const {before = {}, after = {}} = event;
  if ('title' in before && 'title' in after) {
    const currency = after.currency ?? before.currency;
    return Object.keys(FIELDS)
      .filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
      .map(key => `${FIELDS[key]}: ${show(key, before[key], currency, labels)} → ${show(key, after[key], currency, labels)}`);
  }
  const name = after.name ?? before.name;
  return name ? [`파일: ${name}`] : [];
}

export function render(claim, {session}) {
  return html`
    <div class="section-title"><div><h2>활동 내역</h2><p class="muted">이 건에서 한 일이 시간순으로 남아요. 기록은 추가만 되고 고치거나 지울 수 없어요.</p></div>
      <span class="saved">${claim.events.length}개 기록</span></div>
    <ol class="timeline history">
      ${claim.events.map(event => {
        const changes = describeChanges(event, session.config);
        return html`<li class="timeline-item">
          <span class="timeline-icon">${icon(iconForAction(event.action))}</span>
          <div class="timeline-body">
            <p>${event.action}</p>
            <small><time datetime="${event.createdAt}">${dateTime(event.createdAt)}</time></small>
            ${changes.length ? html`<ul class="change-list">${changes.map(change => html`<li>${change}</li>`)}</ul>` : ''}
            <details><summary>원본 기록 보기</summary><pre class="email-preview">${JSON.stringify({before: event.before, after: event.after}, null, 2)}</pre></details>
          </div>
        </li>`;
      })}
    </ol>`;
}

export const handlers = {};
