import {html} from '../../core/html.mjs';
import {money} from '../../core/format.mjs';
import {selectMetrics, selectTodo, selectInProgress, selectRecentActivity} from '../../viewmodels/claim-list.vm.mjs';
import {emptyState, skeletonCards} from '../components/ui.view.mjs';
import {claimCards} from '../components/claim-card.view.mjs';
import {todoItem} from '../components/next-action.view.mjs';
import {activityList} from '../components/timeline.view.mjs';
import {icon} from '../components/icons.view.mjs';

// Home is a status board (DESIGN.md §2 "홈"): how much is still owed, what to
// do now, what is in progress and what happened lately.

function kpis(list) {
  const {activeCount, awaitingCount, byCurrency} = selectMetrics(list);
  const owed = byCurrency.filter(row => row.remaining > 0);
  const month = byCurrency.filter(row => row.month !== 0);
  const claimed = byCurrency.filter(row => row.claimed > 0);
  return html`<section class="kpis" aria-label="회수 현황">
    <article class="kpi kpi-main">
      <p class="kpi-label">${icon('coin')}아직 돌려받지 못한 금액</p>
      <div class="kpi-amounts">${owed.length
        ? owed.map(row => html`<strong class="kpi-amount">${money(row.remaining, row.currency)}</strong>`)
        : html`<strong class="kpi-amount positive">없어요</strong>`}</div>
      <p class="kpi-note">${claimed.length
        ? html`진행 중인 반품·환불 청구액 ${claimed.map((row, index) => html`${index ? ' · ' : ''}<span class="num">${money(row.claimed, row.currency)}</span>`)} 중`
        : '진행 중인 반품·환불 건이 없어요.'}</p>
    </article>
    <article class="kpi">
      <p class="kpi-label">${icon('claims')}진행 중</p>
      <strong class="kpi-value">${activeCount}<span>건</span></strong>
    </article>
    <article class="kpi">
      <p class="kpi-label">${icon('clock')}답변 대기</p>
      <strong class="kpi-value">${awaitingCount}<span>건</span></strong>
    </article>
    <article class="kpi">
      <p class="kpi-label">${icon('check')}이번 달 회수</p>
      ${month.length
        ? html`<div class="kpi-lines">${month.map(row => html`<strong class="positive">${money(row.month, row.currency)}</strong>`)}</div>`
        : html`<p class="kpi-empty">아직 없어요</p>`}
    </article>
  </section>`;
}

function welcome(session) {
  return html`<div class="welcome">
    <h1>안녕하세요, ${session.user.name}님</h1>
    <p>아직 돌려받지 못한 금액과 진행 중인 클레임을 확인하세요.</p>
  </div>`;
}

export function renderDashboard({list, session}) {
  const labels = session.config;
  if (list.loading && !list.claims.length) return html`${welcome(session)}${skeletonCards(3)}`;
  if (list.error) return html`${welcome(session)}<section class="panel">${emptyState('목록을 불러오지 못했어요', `${list.error} 새로고침해서 다시 시도하세요.`)}</section>`;
  if (!list.claims.length) {
    return html`${welcome(session)}<section class="panel first-run">${emptyState('아직 등록한 클레임이 없어요',
      '해외에서 산 상품이 고장 났거나 다른 물건이 왔다면, 주문 정보부터 차근차근 등록해 보세요. 단계별로 안내해 드려요.',
      {dori: true, action: {name: 'new-claim', label: '첫 클레임 등록하기'}})}
      <ol class="first-steps" aria-label="이렇게 진행돼요">
        <li><span>1</span>주문·문제 등록</li><li><span>2</span>증빙 올리기</li><li><span>3</span>판매처에 문의</li><li><span>4</span>답변·합의 기록</li><li><span>5</span>실제 회수 기록</li>
      </ol>
    </section>`;
  }

  const todo = selectTodo(list.claims, {aiEnabled: session.ai.enabled});
  const inProgress = selectInProgress(list.claims);
  const recent = selectRecentActivity(list.claims, labels);
  return html`
    ${welcome(session)}
    ${kpis(list)}
    <div class="home-grid">
      <div class="home-main">
        <section class="panel home-section" aria-labelledby="todo-title">
          <div class="section-head"><h2 id="todo-title">지금 해야 할 일</h2>${todo.length ? html`<small>${todo.length}건</small>` : ''}</div>
          ${todo.length
            ? html`<ol class="todo-list">${todo.map(item => todoItem(item, labels))}</ol>`
            : html`<p class="quiet">지금 바로 할 일은 없어요. 판매처 답변이 오면 여기에 알려 드려요.</p>`}
        </section>
        <section class="home-section" aria-labelledby="progress-title">
          <div class="section-head"><h2 id="progress-title">진행 중인 클레임</h2><a class="text-link" href="#/claims">전체 보기${icon('arrow')}</a></div>
          ${inProgress.length ? claimCards(inProgress, labels) : html`<p class="quiet">진행 중인 클레임이 없어요. 종료한 건은 클레임 목록에서 볼 수 있어요.</p>`}
        </section>
      </div>
      <aside class="panel home-side" aria-labelledby="recent-title">
        <div class="section-head"><h2 id="recent-title">최근 활동</h2></div>
        ${activityList(recent, {withClaim: true})}
      </aside>
    </div>`;
}

export const handlers = {
  click: {
    'new-claim': ({vms}) => vms.app.openDialog('claim-form', {mode: 'create'}),
  },
};
