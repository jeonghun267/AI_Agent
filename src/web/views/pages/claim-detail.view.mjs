import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {statePill, emptyState, skeletonDetail} from '../components/ui.view.mjs';
import {progressSteps, recoveryMeter} from '../components/progress.view.mjs';
import * as overview from '../claim-detail/overview.view.mjs';
import * as files from '../claim-detail/files.view.mjs';
import * as inquiry from '../claim-detail/inquiry.view.mjs';
import * as replies from '../claim-detail/replies.view.mjs';
import * as ledger from '../claim-detail/ledger.view.mjs';
import * as history from '../claim-detail/history.view.mjs';

const TABS = [
  ['overview', '주문·합의', overview],
  ['files', '증빙', files],
  ['inquiry', '문의', inquiry],
  ['replies', '판매처 답변', replies],
  ['ledger', '실제 회수', ledger],
  ['history', '변경 이력', history],
];

export const tabViews = TABS.map(([, , view]) => view);

export const handlers = {
  click: {
    'go-home': ({vms}) => vms.app.go({name: 'dashboard'}),
  },
};

export function renderClaimDetail(snapshot) {
  const {detail, session} = snapshot;
  if (detail.loading) return html`<section class="panel">${skeletonDetail()}</section>`;
  if (detail.error || !detail.claim) {
    return html`<section class="panel">${emptyState('클레임을 찾을 수 없어요', detail.error || '삭제됐거나 주소가 바뀌었을 수 있어요.', {dori: 'sm', action: {name: 'go-home', label: '내 클레임으로'}})}</section>`;
  }
  const claim = detail.claim;
  const labels = session.config;
  const [, , tabView] = TABS.find(([id]) => id === detail.tab) ?? TABS[0];

  return html`
    <div class="detail-header">
      <div class="breadcrumb"><a href="${claim.deleted ? '#/trash' : '#/'}">← ${claim.deleted ? '휴지통' : '내 클레임'}</a></div>
      <div class="detail-title"><h1>${claim.title}</h1>${statePill(claim.state, labels.states)}</div>
      <dl class="meta-list">
        <div><dt>판매처</dt><dd>${claim.vendor}</dd></div>
        <div><dt>주문번호</dt><dd>${claim.orderRef}</dd></div>
        <div><dt>요청</dt><dd>${labels.claimKinds[claim.kind]}</dd></div>
        <div><dt>마지막 저장</dt><dd>${dateTime(claim.updatedAt)}</dd></div>
      </dl>
      <section class="progress-card" aria-label="진행 상황">
        ${progressSteps(claim)}
        ${recoveryMeter(claim)}
      </section>
      <p class="next"><strong>다음 할 일</strong>${claim.nextStep}</p>
    </div>
    <section class="panel">
      <nav class="tabs" aria-label="클레임 세부 메뉴">
        ${TABS.map(([id, label]) => html`<a href="#/claims/${claim.id}${id === 'overview' ? '' : `/${id}`}" class="${detail.tab === id ? 'active' : ''}" aria-current="${detail.tab === id ? 'page' : 'false'}">${label}</a>`)}
      </nav>
      <div class="content">${tabView.render(claim, snapshot)}</div>
    </section>`;
}
