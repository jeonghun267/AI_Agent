import {html} from '../core/html.mjs';
import {brand} from './pages/auth.view.mjs';

const NAV = [['dashboard', '내 클레임', '#/'], ['trash', '휴지통', '#/trash'], ['settings', '설정', '#/settings']];

// Signed-in frame: top bar, navigation and footer around the current page.
export function renderShell({app, session}, page) {
  const current = app.route.name === 'claim' ? 'dashboard' : app.route.name;
  return html`
    ${app.offline ? html`<div class="offline" role="status">인터넷 연결이 끊겼어요. 서버 저장을 확인하기 전에는 완료로 표시하지 않아요.</div>` : ''}
    <div class="shell">
      <header class="topbar">
        ${brand()}
        <div class="user-info">
          <span class="user-name">${session.user.name}</span>
          <button class="btn ghost small" type="button" data-action="logout">로그아웃</button>
        </div>
      </header>
      <nav class="nav" aria-label="주 메뉴">
        ${NAV.map(([name, label, href]) => html`<a href="${href}" class="${current === name ? 'active' : ''}" aria-current="${current === name ? 'page' : 'false'}">${label}</a>`)}
      </nav>
      <main id="main" class="workspace">${page}</main>
      <footer class="footer"><span>ReLo는 판매처에 메일을 보내거나 결제·환불을 대신하지 않아요. 기록과 문의 준비를 돕습니다.</span></footer>
    </div>`;
}

export const handlers = {
  click: {
    logout: ({vms}) => vms.session.logout(),
  },
};
