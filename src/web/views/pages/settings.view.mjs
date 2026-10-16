import {html} from '../../core/html.mjs';
import {dateTime} from '../../core/format.mjs';
import {saveBlob} from '../../core/dom.mjs';
import {field, formActions} from '../components/ui.view.mjs';

export const AI_CONSENT_TEXT = html`
  <p>AI 버튼을 누를 때만, 그 작업에 필요한 내용이 <strong>Google Gemini API</strong>로 전송돼요.</p>
  <ul class="plain-list">
    <li>문의 초안: 저장한 사건 정보(판매처, 주문번호, 품목, 금액, 문제 설명, 증빙 파일 이름, 최근 답변)</li>
    <li>번역·답변 분석: 입력한 문제 설명 또는 붙여 넣은 판매처 답변</li>
    <li>주문 정보 읽기: 선택한 증빙 파일(PDF·이미지)</li>
  </ul>
  <p>데이터는 해외(미국 등)에 있는 Google 서버에서 처리될 수 있어요. AI 결과는 자동으로 저장되지 않고, 직접 확인한 뒤 저장해야 반영돼요. 동의는 설정에서 언제든 철회할 수 있어요.</p>`;

export function renderSettings({session}) {
  const {user, ai} = session;
  return html`
    <div class="heading"><div><h1>설정</h1><p>계정과 개인정보, AI 사용을 관리해요.</p></div></div>
    <div class="settings-grid">
      <section class="panel"><div class="content">
        <h2>계정</h2>
        <dl class="fact-grid">
          <div><dt>이름</dt><dd>${user.name}</dd></div>
          <div><dt>이메일</dt><dd>${user.email}</dd></div>
          <div><dt>가입일</dt><dd>${dateTime(user.createdAt)}</dd></div>
        </dl>
      </div></section>

      <section class="panel"><div class="content">
        <h2>AI 기능</h2>
        ${!ai.enabled
          ? html`<p class="muted">이 서비스에는 아직 AI가 설정되지 않았어요. 기본 영문 틀은 그대로 쓸 수 있어요.</p>`
          : html`
            <p class="status-line">${ai.consented ? html`<strong>동의함</strong> · ${dateTime(user.aiConsentAt)}` : '아직 동의하지 않았어요.'} · 모델 ${ai.model}</p>
            ${AI_CONSENT_TEXT}
            <div class="actions">${ai.consented
              ? html`<button class="btn danger" type="button" data-action="set-ai-consent" data-consent="0">AI 처리 동의 철회</button>`
              : html`<button class="btn primary" type="button" data-action="set-ai-consent" data-consent="1">AI 처리에 동의</button>`}</div>`}
      </div></section>

      <section class="panel"><div class="content">
        <h2>내 데이터 내보내기</h2>
        <p class="muted">모든 클레임, 회수 기록, 문의 버전, 변경 이력과 증빙 파일을 JSON 파일 하나로 받아요.</p>
        <div class="actions"><button class="btn" type="button" data-action="export-data">내보내기</button></div>
      </div></section>

      <section class="panel"><div class="content">
        <h2>회원 탈퇴</h2>
        <p class="muted">계정과 모든 클레임·증빙·기록이 즉시 영구 삭제돼요. 되돌릴 수 없으니 필요하면 먼저 내보내기를 하세요.</p>
        <div class="actions"><button class="btn danger" type="button" data-action="delete-account">회원 탈퇴</button></div>
      </div></section>
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
