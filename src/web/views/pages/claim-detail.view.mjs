import {html} from '../../core/html.mjs';
import {dateTime, shortDate} from '../../core/format.mjs';
import {statePill, emptyState, skeletonDetail} from '../components/ui.view.mjs';
import {progressSteps, moneyCard} from '../components/progress.view.mjs';
import {nextActionCard} from '../components/next-action.view.mjs';
import {activityList} from '../components/timeline.view.mjs';
import {icon} from '../components/icons.view.mjs';
import * as overview from '../claim-detail/overview.view.mjs';
import * as files from '../claim-detail/files.view.mjs';
import * as inquiry from '../claim-detail/inquiry.view.mjs';
import * as replies from '../claim-detail/replies.view.mjs';
import * as ledger from '../claim-detail/ledger.view.mjs';
import * as history from '../claim-detail/history.view.mjs';

// [route tab, label, view, count of records shown next to the label]
const TABS = [
  ['overview', '개요', overview, () => 0],
  ['files', '증빙', files, claim => claim.files.length],
  ['inquiry', '문의', inquiry, claim => claim.drafts.length],
  ['replies', '답변', replies, claim => claim.replies.length],
  ['ledger', '회수 기록', ledger, claim => claim.ledger.length],
  ['history', '활동 내역', history, () => 0],
];

export const tabViews = TABS.map(([, , view]) => view);

export const handlers = {
  click: {
    'go-home': ({vms}) => vms.app.go({name: 'claims'}),
  },
};

function activityCard(claim) {
  const name = event => event.after?.name ?? event.before?.name;
  const items = claim.events.slice(0, 5).map(event => ({at: event.createdAt, text: name(event) ? `${event.action} · ${name(event)}` : event.action}));
  return html`<section class="side-card activity-card">
    <div class="side-head"><h2>최근 활동</h2><a href="#/claims/${claim.id}/history">전체 보기</a></div>
    ${items.length ? activityList(items) : html`<p class="muted">아직 활동이 없어요.</p>`}
  </section>`;
}

// The claim as a working board (DESIGN.md §2 "클레임 상세"): who and what on
// the left of the header, money on the right, the six steps under it, then
// the next action beside the tabs.
export function renderClaimDetail(snapshot) {
  const {detail, session} = snapshot;
  if (detail.loading) return html`<section class="panel">${skeletonDetail()}</section>`;
  if (detail.error || !detail.claim) {
    return html`<section class="panel">${emptyState('클레임을 찾을 수 없어요', detail.error || '삭제됐거나 주소가 바뀌었을 수 있어요.', {dori: 'sm', action: {name: 'go-home', label: '내 클레임으로'}})}</section>`;
  }
  const claim = detail.claim;
  const labels = session.config;
  const [, , tabView] = TABS.find(([id]) => id === detail.tab) ?? TABS[0];

  return html`<div class="detail">
    <section class="hero">
      <div class="hero-main">
        <a class="back-link" href="${claim.deleted ? '#/trash' : '#/claims'}">${icon('back')}${claim.deleted ? '휴지통' : '내 클레임'}</a>
        <div class="hero-title">
          <p class="hero-vendor">${claim.vendor}<span>${labels.claimKinds[claim.kind]}</span></p>
          <div class="detail-title"><h1>${claim.title}</h1>${statePill(claim.state, labels.states)}</div>
          <dl class="meta-list">
            <div><dt>주문번호</dt><dd>${claim.orderRef}</dd></div>
            <div><dt>주문일</dt><dd>${shortDate(claim.orderedOn)}</dd></div>
            <div><dt>마지막 저장</dt><dd>${dateTime(claim.updatedAt)}</dd></div>
          </dl>
        </div>
      </div>
      ${moneyCard(claim)}
    </section>
    <section class="progress-card" aria-label="진행 상황">${progressSteps(claim)}</section>
    <div class="detail-layout">
      ${nextActionCard(claim, snapshot)}
      <section class="panel detail-tabs">
        <nav class="tabs" aria-label="클레임 세부 메뉴">
          ${TABS.map(([id, label, , count]) => html`<a href="#/claims/${claim.id}${id === 'overview' ? '' : `/${id}`}" class="${detail.tab === id ? 'active' : ''}" aria-current="${detail.tab === id ? 'page' : 'false'}">${label}${count(claim) ? html`<span class="tab-count">${count(claim)}</span>` : ''}</a>`)}
        </nav>
        <div class="content">${tabView.render(claim, snapshot)}</div>
      </section>
      ${activityCard(claim)}
      ${overview.manageCard(claim)}
    </div>
  </div>`;
}
