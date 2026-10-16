import {html, raw} from '../core/html.mjs';
import {brand} from './pages/auth.view.mjs';
import {selectNeedsEmailVerification} from '../viewmodels/session.vm.mjs';

// Outline icons for the mobile bottom tab bar (decorative; the label carries meaning).
const ICON = {
  dashboard: '<path d="M7 4h10a2 2 0 0 1 2 2v14l-3-2-2 2-2-2-2 2-2-2-3 2V6a2 2 0 0 1 2-2Z"/><path d="M9 9h6M9 13h4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};
const icon = name => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`);

const NAV = [['dashboard', '내 클레임', '#/'], ['trash', '휴지통', '#/trash'], ['settings', '설정', '#/settings']];

// Signed-in frame. Desktop: top bar + top tabs. Mobile (≤640px): bottom tab bar.
export function renderShell({app, session}, page) {
  const current = app.route.name === 'claim' ? 'dashboard' : app.route.name;
  return html`
    ${app.offline ? html`<div class="offline" role="status">인터넷 연결이 끊겼어요. 서버에 저장된 것을 확인하기 전에는 완료로 표시하지 않아요.</div>` : ''}
    ${selectNeedsEmailVerification(session) ? html`<aside class="verify-band" aria-label="이메일 인증"><div class="verify-band-inner">
      <p><strong>이메일 인증이 필요해요.</strong> ${session.user.email} 주소로 보낸 링크를 열어 주세요.</p>
      <button class="btn small" type="button" data-action="resend-verification">인증 메일 다시 받기</button>
    </div></aside>` : ''}
    <div class="shell">
      <header class="topbar"><div class="topbar-inner">
        ${brand()}
        <div class="user-info">
          <span class="user-name">${session.user.name}</span>
          <button class="btn ghost small" type="button" data-action="logout">로그아웃</button>
        </div>
      </div></header>
      <nav class="nav" aria-label="주 메뉴"><div class="nav-inner">
        ${NAV.map(([name, label, href]) => html`<a href="${href}" class="${current === name ? 'active' : ''}" aria-current="${current === name ? 'page' : 'false'}">${icon(name)}<span>${label}</span></a>`)}
      </div></nav>
      <main id="main" class="workspace">${page}</main>
      <footer class="footer">ReLo는 판매처에 메일을 보내거나 결제·환불을 대신하지 않아요. 기록과 문의 준비를 도와요.</footer>
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
