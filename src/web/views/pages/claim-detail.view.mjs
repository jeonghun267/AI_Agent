import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {statePill, emptyState} from '../components/ui.view.mjs';
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

export function renderClaimDetail(snapshot) {
  const {detail, session} = snapshot;
  if (detail.loading) return emptyState('불러오는 중이에요');
  if (detail.error || !detail.claim) return emptyState('클레임을 찾을 수 없어요', detail.error);
  const claim = detail.claim;
  const labels = session.config;
  const [, , tabView] = TABS.find(([id]) => id === detail.tab) ?? TABS[0];

  return html`
    <div class="detail-header">
      <div class="breadcrumb"><a href="${claim.deleted ? '#/trash' : '#/'}">← ${claim.deleted ? '휴지통' : '내 클레임'}</a> / ${claim.orderRef}</div>
      <div class="detail-title"><h1>${claim.title}</h1>${statePill(claim.state, labels.states)}</div>
      <div class="details-meta">
        <span>${claim.vendor}</span>
        <span>${labels.claimKinds[claim.kind]} · ${claim.currency}</span>
        <span>마지막 저장 ${dateTime(claim.updatedAt)}</span>
      </div>
      <div class="next">다음 할 일 · ${claim.nextStep}</div>
    </div>
    <section class="panel">
      <nav class="tabs" aria-label="클레임 세부 메뉴">
        ${TABS.map(([id, label]) => html`<a href="#/claims/${claim.id}${id === 'overview' ? '' : `/${id}`}" class="${detail.tab === id ? 'active' : ''}" aria-current="${detail.tab === id ? 'page' : 'false'}">${label}</a>`)}
      </nav>
      <div class="content">${tabView.render(claim, snapshot)}</div>
    </section>`;
}
