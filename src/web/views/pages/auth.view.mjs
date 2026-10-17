import {html} from '../../core/html.mjs';
import {field, formError} from '../components/ui.view.mjs';
import {doriFigure} from '../components/dori.view.mjs';
import {icon} from '../components/icons.view.mjs';

export const brand = () => html`<a class="brand" href="#/"><img src="/assets/dori-mark.svg" alt="" width="36" height="36">ReLo</a>`;

const MISMATCH = '비밀번호가 서로 달라요. 두 칸에 같은 비밀번호를 입력하세요.';

// Three promises the service keeps, said where people decide to trust it.
const trustList = () => html`<ul class="trust-list">
  <li>${icon('lock')}내 클레임 기록은 본인만 볼 수 있어요</li>
  <li>${icon('sparkle')}AI 기능은 동의한 경우에만 작동해요</li>
  <li>${icon('shield')}판매처에 대신 연락하거나 돈을 받지 않아요</li>
</ul>`;

// Sign-in screens: one card in the exact centre of the viewport, with Dori
// standing on its top edge and waving once when the screen opens.
const authScreen = content => html`<div class="auth-screen"><main id="main" class="auth-page">
  <div class="auth-dori">${doriFigure({pose: 'waving', size: 'md'})}</div>
  ${brand()}${content}
</main></div>`;

export function renderLogin({session}) {
  const demo = session.config?.demoAccount;
  return authScreen(html`
    <h1>${session.expired ? '다시 로그인해 주세요' : '해외 직구 반품·환불, 끝까지 챙겨요'}</h1>
    <p class="lead">${session.expired
      ? '로그인 시간이 지났어요. 다시 로그인하면 보던 화면으로 돌아가요.'
      : '청구부터 판매처 답변, 실제 입금까지 한 곳에서 기록하세요.'}</p>
    <form id="login-form">
      <div class="form-grid single">
        ${field('이메일', 'email', '', {type: 'email', required: true, attrs: 'autocomplete="username" spellcheck="false" placeholder="you@example.com"'})}
        ${field('비밀번호', 'password', '', {type: 'password', required: true, attrs: 'autocomplete="current-password"'})}
      </div>
      ${formError()}
      <div class="form-actions"><button class="btn primary wide" type="submit">로그인</button></div>
    </form>
    ${session.config?.mail?.enabled ? html`<p class="auth-switch"><a href="#/forgot">비밀번호를 잊었어요</a></p>` : ''}
    <p class="auth-switch">처음이신가요? <a href="#/signup">회원가입</a></p>
    ${trustList()}
    ${demo ? html`<div class="dev-hint">
      <strong>개발 환경 데모 계정</strong>
      <p>${demo.email} / ${demo.password}</p>
      <button class="btn small" type="button" data-action="fill-demo">데모 계정 입력</button>
    </div>` : ''}`);
}

export function renderSignup() {
  return authScreen(html`
    <h1>해외 직구 문제를 쉽게 정리하세요</h1>
    <p class="lead">주문 정보와 증빙은 내 계정에만 저장돼요. 판매처에 자동으로 보내지 않아요.</p>
    <form id="signup-form">
      <div class="form-grid single">
        ${field('이름 (선택)', 'name', '', {attrs: 'autocomplete="name" maxlength="50"'})}
        ${field('이메일', 'email', '', {type: 'email', required: true, attrs: 'autocomplete="email" spellcheck="false" placeholder="you@example.com"'})}
        ${field('비밀번호', 'password', '', {type: 'password', required: true, attrs: 'autocomplete="new-password" minlength="10"', hint: '10자 이상'})}
        ${field('비밀번호 확인', 'passwordConfirm', '', {type: 'password', required: true, attrs: 'autocomplete="new-password" minlength="10"'})}
      </div>
      ${formError()}
      <div class="form-actions"><button class="btn primary wide" type="submit">가입하고 시작하기</button></div>
    </form>
    <p class="auth-switch">이미 계정이 있나요? <a href="#/login">로그인</a></p>
    ${trustList()}`);
}

// #/forgot: ask for the address, then the same confirmation whether or not it has an account.
export function renderForgot({session}) {
  const sent = session.resetRequest;
  const minutes = session.config?.mail?.resetLinkMinutes;
  return authScreen(html`
    ${sent ? html`
      <h1>메일함을 확인하세요</h1>
      <p class="lead"><strong>${sent.email}</strong> 주소로 가입한 계정이 있으면 비밀번호 재설정 링크를 보냈어요. 링크는 ${minutes}분 동안 한 번만 쓸 수 있어요.</p>
      <div class="notice">메일이 보이지 않으면 스팸함을 확인하세요. 몇 분이 지나도 없으면 다시 요청하세요.</div>
      <div class="form-actions"><button class="btn wide" type="button" data-action="forgot-again">다시 요청하기</button></div>`
    : html`
      <h1>비밀번호 재설정</h1>
      <p class="lead">가입한 이메일을 입력하면 새 비밀번호를 정하는 링크를 보내 드려요.</p>
      <form id="forgot-form">
        <div class="form-grid single">
          ${field('이메일', 'email', '', {type: 'email', required: true, attrs: 'autocomplete="username" spellcheck="false" placeholder="you@example.com"'})}
        </div>
        ${formError()}
        <div class="form-actions"><button class="btn primary wide" type="submit">재설정 링크 받기</button></div>
      </form>`}
    <p class="auth-switch"><a href="#/login">로그인으로 돌아가기</a></p>`);
}

// #/reset/:token: the link from the email. The token stays in the route, never in the form.
export function renderReset() {
  return authScreen(html`
    <h1>새 비밀번호 정하기</h1>
    <p class="lead">비밀번호를 바꾸면 모든 기기에서 로그아웃돼요. 새 비밀번호로 다시 로그인하세요.</p>
    <form id="reset-form">
      <div class="form-grid single">
        ${field('새 비밀번호', 'password', '', {type: 'password', required: true, attrs: 'autocomplete="new-password" minlength="10"', hint: '10자 이상'})}
        ${field('새 비밀번호 확인', 'passwordConfirm', '', {type: 'password', required: true, attrs: 'autocomplete="new-password" minlength="10"'})}
      </div>
      ${formError()}
      <div class="form-actions"><button class="btn primary wide" type="submit">비밀번호 바꾸기</button></div>
    </form>
    <p class="auth-switch">링크가 만료됐나요? <a href="#/forgot">다시 요청하기</a></p>`);
}

export const handlers = {
  click: {
    'fill-demo': ({vms}) => {
      const demo = vms.session.state.config?.demoAccount;
      document.querySelector('#field-email').value = demo.email;
      document.querySelector('#field-password').value = demo.password;
    },
    'forgot-again': ({vms}) => vms.session.clearResetRequest(),
  },
  submit: {
    'login-form': ({values, vms}) => vms.session.login(values.email, values.password),
    'signup-form': ({values, vms}) => {
      if (values.password !== values.passwordConfirm) throw new Error(MISMATCH);
      return vms.session.signup({email: values.email, password: values.password, name: values.name});
    },
    'forgot-form': ({values, vms}) => vms.session.requestPasswordReset(values.email),
    'reset-form': ({values, vms}) => {
      if (values.password !== values.passwordConfirm) throw new Error(MISMATCH);
      return vms.app.resetPassword(values.password);
    },
  },
};
