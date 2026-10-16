import {html} from '../../core/html.mjs';
import {field, formError} from '../components/ui.view.mjs';

export const brand = () => html`<a class="brand" href="#/"><img src="/assets/dori-mark.svg" alt="" width="36" height="36">ReLo</a>`;

// Sign-in screens: one card in the exact centre of the viewport.
export function renderLogin({session}) {
  const demo = session.config?.demoAccount;
  return html`<div class="auth-screen"><main id="main" class="auth-page">
    ${brand()}
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
    <p class="auth-switch">처음이신가요? <a href="#/signup">회원가입</a></p>
    ${demo ? html`<div class="dev-hint">
      <strong>개발 환경 데모 계정</strong>
      <p>${demo.email} / ${demo.password}</p>
      <button class="btn small" type="button" data-action="fill-demo">데모 계정 입력</button>
    </div>` : ''}
  </main></div>`;
}

export function renderSignup() {
  return html`<div class="auth-screen"><main id="main" class="auth-page">
    ${brand()}
    <h1>회원가입</h1>
    <p class="lead">입력한 주문 정보와 증빙은 내 계정에만 저장돼요. 판매처에 자동으로 보내지 않아요.</p>
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
  </main></div>`;
}

export const handlers = {
  click: {
    'fill-demo': ({vms}) => {
      const demo = vms.session.state.config?.demoAccount;
      document.querySelector('#field-email').value = demo.email;
      document.querySelector('#field-password').value = demo.password;
    },
  },
  submit: {
    'login-form': ({values, vms}) => vms.session.login(values.email, values.password),
    'signup-form': ({values, vms}) => {
      if (values.password !== values.passwordConfirm) throw new Error('비밀번호가 서로 달라요. 두 칸에 같은 비밀번호를 입력하세요.');
      return vms.session.signup({email: values.email, password: values.password, name: values.name});
    },
  },
};
