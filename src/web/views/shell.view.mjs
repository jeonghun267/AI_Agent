import {html} from '../core/html.mjs';
import {brand} from './pages/auth.view.mjs';
import {selectNeedsEmailVerification} from '../viewmodels/session.vm.mjs';
import {icon} from './components/icons.view.mjs';

const NAV = [['dashboard', '홈', '#/', 'home'], ['claims', '클레임', '#/claims', 'claims'], ['trash', '휴지통', '#/trash', 'trash'], ['settings', '설정', '#/settings', 'settings']];

const navLink = ([name, label, href, iconName], current) =>
  html`<a href="${href}" class="${current === name ? 'active' : ''}" aria-current="${current === name ? 'page' : 'false'}">${icon(iconName)}<span>${label}</span></a>`;

// Signed-in frame (DESIGN.md §2 "내비게이션").
//   Desktop/tablet: one top bar with the menu and a fixed "새 클레임" button.
//   Phone (≤640px): bottom tab bar 홈 · 클레임 · 새 신청 · 휴지통 · 설정, with 새 신청 raised in the middle.
export function renderShell({app, session}, page) {
  const current = app.route.name === 'claim' ? 'claims' : app.route.name;
  return html`
    ${app.offline ? html`<div class="offline" role="status">인터넷 연결이 끊겼어요. 서버에 저장된 것을 확인하기 전에는 완료로 표시하지 않아요.</div>` : ''}
    ${selectNeedsEmailVerification(session) ? html`<aside class="verify-band" aria-label="이메일 인증"><div class="verify-band-inner">
      <p><strong>이메일 인증이 필요해요.</strong> ${session.user.email} 주소로 보낸 링크를 열어 주세요.</p>
      <button class="btn small" type="button" data-action="resend-verification">인증 메일 다시 받기</button>
    </div></aside>` : ''}
    <div class="shell">
      <header class="topbar"><div class="topbar-inner">
        ${brand()}
        <nav class="nav" aria-label="주 메뉴">
          ${navLink(NAV[0], current)}${navLink(NAV[1], current)}
          <button class="nav-new" type="button" data-action="new-claim"><span class="nav-new-icon">${icon('plus')}</span><span>새 신청</span></button>
          ${navLink(NAV[2], current)}${navLink(NAV[3], current)}
        </nav>
        <div class="topbar-actions">
          <button class="btn accent top-new" type="button" data-action="new-claim">${icon('plus')}새 클레임</button>
          <span class="user-name">${session.user.name}</span>
          <button class="btn ghost small" type="button" data-action="logout">로그아웃</button>
        </div>
      </div></header>
      <main id="main" class="workspace">${page}</main>
      <footer class="footer">${icon('shield')}ReLo는 판매처에 메일을 보내거나 결제·환불을 대신하지 않아요. 기록과 문의 준비를 도와요.</footer>
    </div>`;
}

export const handlers = {
  click: {
    logout: ({vms}) => vms.session.logout(),
    'resend-verification': async ({vms}) => {
      const sent = await vms.session.resendVerification();
      vms.app.notify(sent ? '인증 메일을 다시 보냈어요. 메일함을 확인하세요.' : '이미 인증된 이메일이에요.');
    },
  },
};
