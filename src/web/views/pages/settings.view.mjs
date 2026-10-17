import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {saveBlob} from '../../core/dom.mjs';
import {field, formActions, pageHead} from '../components/ui.view.mjs';
import {icon} from '../components/icons.view.mjs';

export const AI_CONSENT_TEXT = html`
  <p>AI 버튼을 누를 때만, 그 작업에 필요한 내용이 <strong>Google Gemini API</strong>로 전송돼요.</p>
  <ul class="plain-list">
    <li>문의 초안: 저장한 사건 정보(판매처, 주문번호, 품목, 금액, 문제 설명, 증빙 파일 이름, 최근 답변)</li>
    <li>번역·답변 분석: 입력한 문제 설명 또는 붙여 넣은 판매처 답변</li>
    <li>주문 정보 읽기: 고른 주문서·증빙 파일(PDF·이미지)</li>
  </ul>
  <p>데이터는 해외(미국 등)에 있는 Google 서버에서 처리될 수 있어요. AI 결과는 자동으로 저장되지 않고, 직접 확인한 뒤 저장해야 반영돼요. 동의는 설정에서 언제든 철회할 수 있어요.</p>`;

const card = (iconName, title, body, {tone = ''} = {}) => html`<section class="settings-card${tone ? ` ${tone}` : ''}">
  <span class="settings-icon">${icon(iconName)}</span>
  <div class="settings-body"><h2>${title}</h2>${body}</div>
</section>`;

function emailCard({user, config}) {
  if (user.emailVerifiedAt) return card('mail', '이메일 인증', html`<p class="status-line"><span class="tag sent">${icon('check')}인증됨</span> ${dateTime(user.emailVerifiedAt)}</p>`);
  if (!config.mail?.enabled) return card('mail', '이메일 인증', html`<p class="muted">이 서비스에서는 아직 메일 발송이 꺼져 있어요.</p>`);
  return card('mail', '이메일 인증', html`
    <p class="status-line"><span class="tag warning">${icon('alert')}인증 전</span> ${user.email} 주소로 보낸 링크를 열어 주세요.</p>
    <div class="actions"><button class="btn" type="button" data-action="resend-verification">인증 메일 다시 받기</button></div>`);
}

// A personal data centre (DESIGN.md §2 "설정"): account, verification, AI
// consent, export, and leaving — the irreversible one last and set apart.
export function renderSettings({session}) {
  const {user, ai} = session;
  return html`
    ${pageHead('설정', '내 계정과 데이터, AI 사용을 직접 관리해요.')}
    <div class="settings-list">
      ${card('user', '계정 정보', html`<dl class="fact-grid">
        <div><dt>이름</dt><dd>${user.name}</dd></div>
        <div><dt>이메일</dt><dd>${user.email}</dd></div>
        <div><dt>가입일</dt><dd>${dateTime(user.createdAt)}</dd></div>
      </dl>`)}
      ${emailCard(session)}
      ${card('sparkle', 'AI 기능', !ai.enabled
        ? html`<p class="muted">이 서비스에는 아직 AI가 설정되지 않았어요. 기본 영문 틀은 그대로 쓸 수 있어요.</p>`
        : html`
          <p class="status-line">${ai.consented ? html`<span class="tag ai">${icon('check')}동의함</span> ${dateTime(user.aiConsentAt)}` : html`<span class="tag">동의 전</span>`} · 모델 ${ai.model}</p>
          <details class="consent-details"${ai.consented ? '' : html` open`}><summary>AI로 보내는 내용 보기</summary>${AI_CONSENT_TEXT}</details>
          <div class="actions">${ai.consented
            ? html`<button class="btn danger" type="button" data-action="set-ai-consent" data-consent="0">AI 처리 동의 철회</button>`
            : html`<button class="btn primary" type="button" data-action="set-ai-consent" data-consent="1">AI 처리에 동의</button>`}</div>`, {tone: 'ai'})}
      ${card('download', '내 데이터 내보내기', html`
        <p class="muted">모든 클레임, 회수 기록, 문의 버전, 활동 내역과 증빙 파일을 JSON 파일 하나로 받아요.</p>
        <div class="actions"><button class="btn" type="button" data-action="export-data">${icon('download')}내보내기</button></div>`)}
      ${card('trash', '회원 탈퇴', html`
        <p class="muted">계정과 모든 클레임·증빙·기록이 즉시 영구 삭제돼요. 되돌릴 수 없으니 필요하면 먼저 내보내기를 하세요.</p>
        <div class="actions"><button class="btn danger" type="button" data-action="delete-account">회원 탈퇴</button></div>`, {tone: 'danger'})}
    </div>`;
}

export function renderDeleteAccountDialog() {
  return html`<form id="delete-account-form">
    <div class="notice warning">계정과 모든 데이터가 즉시 영구 삭제돼요.</div>
    <div class="form-grid single">${field('비밀번호 확인', 'password', '', {type: 'password', required: true, attrs: 'autocomplete="current-password"'})}</div>
    ${formActions('영구 삭제', {danger: true})}
  </form>`;
}

export const handlers = {
  click: {
    'set-ai-consent': async ({el, vms}) => {
      await vms.session.setAiConsent(el.dataset.consent === '1');
      vms.app.notify(el.dataset.consent === '1' ? 'AI 처리에 동의했어요.' : 'AI 처리 동의를 철회했어요.');
    },
    'export-data': async ({vms}) => {
      const data = await vms.session.exportData();
      saveBlob(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}), `relo-export-${new Date().toISOString().slice(0, 10)}.json`);
      vms.app.notify('내 데이터를 파일로 받았어요.');
    },
    'delete-account': ({vms}) => vms.app.openDialog('delete-account'),
  },
  submit: {
    'delete-account-form': async ({values, vms}) => {
      await vms.session.deleteAccount(values.password);
      vms.app.notify('계정을 삭제했어요. 이용해 주셔서 고마워요.');
    },
  },
};
