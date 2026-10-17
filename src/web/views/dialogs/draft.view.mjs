import {html} from '../../core/html.mjs';
import {newRequestKey} from '../../core/http-client.mjs';
import {money, shortDate} from '../../core/format.mjs';
import {field, checkbox, formActions} from '../components/ui.view.mjs';
import {doriPreparing} from '../components/dori.view.mjs';
import {icon} from '../components/icons.view.mjs';
import {splitSubject} from '../claim-detail/inquiry.view.mjs';

export function renderPreparing({kind, useAi, still}, {session}) {
  return {title: '문의 준비', body: doriPreparing({kindLabel: session.config.claimKinds[kind], useAi, still})};
}

// Facts to check the message against, beside the editor (below it on phones).
function factsPanel(claim, labels) {
  const reply = claim.replies[0];
  return html`<aside class="compose-side" aria-label="사건 요약">
    <section>
      <h3>사건 요약</h3>
      <dl class="mini-facts">
        <div><dt>요청</dt><dd>${labels.claimKinds[claim.kind]}</dd></div>
        <div><dt>청구액</dt><dd>${money(claim.claimed, claim.currency)}</dd></div>
        <div><dt>합의액</dt><dd>${claim.agreed === null ? '아직 없음' : money(claim.agreed, claim.currency)}</dd></div>
        <div><dt>주문일</dt><dd>${shortDate(claim.orderedOn)}</dd></div>
      </dl>
      <ul class="mini-list">${claim.items.map(item => html`<li>${item.name} · 문제 ${item.claimQty}개</li>`)}</ul>
    </section>
    <section>
      <h3>증빙 ${claim.files.length}개</h3>
      ${claim.files.length ? html`<ul class="mini-list">${claim.files.slice(0, 5).map(file => html`<li>${icon(file.mime.startsWith('image/') ? 'image' : 'file')}${file.name}</li>`)}</ul>` : html`<p class="muted">아직 없어요. 증빙을 언급하기 전에 먼저 올려 두세요.</p>`}
    </section>
    ${reply ? html`<section>
      <h3>최근 판매처 답변</h3>
      <p class="muted">${labels.replyKinds[reply.kind]} · ${shortDate(reply.recordedAt)}</p>
      <p class="mini-quote">${reply.summaryKo || (reply.body.length > 160 ? `${reply.body.slice(0, 160)}…` : reply.body)}</p>
    </section>` : ''}
  </aside>`;
}

// The editor as a message being prepared: who it goes to, what it asks for,
// what still needs filling in, then subject and body (DESIGN.md §2 "문의 준비").
export function renderEditor({suggestion}, {detail, session}) {
  const claim = detail.claim;
  const {subject, text} = splitSubject(suggestion.body);
  return {
    title: '문의 내용 확인·저장',
    size: 'wide',
    // An AI draft took time and API cost to make, so it counts as unsaved input from the start.
    body: html`<form id="draft-form" class="compose" data-key="${newRequestKey()}" ${suggestion.origin === 'ai' ? html`data-dirty="true"` : ''}>
      <div class="compose-main">
        <div class="compose-to"><span class="compose-label">받는 곳</span><strong>${claim.vendor}</strong><span class="muted">주문 ${claim.orderRef}</span></div>
        ${suggestion.notice ? html`<div class="ai-note">${icon('sparkle')}<div>${suggestion.notice}</div></div>` : ''}
        ${suggestion.summaryKo ? html`<div class="ai-summary">${icon('sparkle')}<p><strong>이 메일이 요청하는 것</strong>${suggestion.summaryKo}</p></div>` : ''}
        ${suggestion.missingInfo?.length ? html`<div class="checklist">
          <strong>${icon('alert')}보내기 전에 채워 주세요</strong>
          <ul>${suggestion.missingInfo.map(item => html`<li>${item}</li>`)}</ul>
          <small>본문의 [확인 필요] 표시를 실제 내용으로 바꿔 주세요.</small>
        </div>` : ''}
        <div class="field"><label for="draft-subject">제목 (영문)</label><input id="draft-subject" name="subject" value="${subject}" maxlength="200" lang="en" spellcheck="true"></div>
        <div class="field"><label for="draft-body">본문 (영문)</label>
          <textarea id="draft-body" class="draft-editor" name="body" required maxlength="14000" lang="en">${text}</textarea></div>
      </div>
      ${factsPanel(claim, session.config)}
      <div class="compose-actions">${formActions('이 버전 저장')}</div>
    </form>`,
  };
}

export function renderSubmit(_, {detail}) {
  const latest = detail.claim.drafts[0];
  return {
    title: '판매처에 보낸 사실 기록',
    body: html`<form id="submit-draft-form" data-key="${newRequestKey()}">
      <input type="hidden" name="draftId" value="${latest.id}">
      <div class="form-grid single">${field('보낸 곳·접수번호 (선택)', 'note', '', {attrs: 'maxlength="500" placeholder="예: 판매처 문의 폼, 접수번호 12345"'})}</div>
      ${checkbox('confirmed', '저장한 최신 버전을 검토했고, 판매처 공식 문의 창구에 직접 보냈어요.', {required: true})}
      <p class="status-line">${icon('lock')}ReLo는 메일을 보내지 않아요. 보낸 사실만 기록해요.</p>
      ${formActions('기록')}
    </form>`,
  };
}

export const handlers = {
  submit: {
    'draft-form': async ({form, values, vms}) => {
      const subject = values.subject.trim();
      const body = subject ? `Subject: ${subject}\n\n${values.body}` : values.body;
      await vms.draft.save(body, vms.app.state.dialog.props.suggestion, form.dataset.key);
      vms.app.notify('문의 버전을 저장했어요. 복사해서 판매처에 보낸 뒤 "보냈어요"를 기록해 주세요.');
    },
    'submit-draft-form': async ({form, values, vms}) => {
      await vms.detail.submitDraft({draftId: values.draftId, confirmed: values.confirmed, note: values.note}, form.dataset.key);
      vms.app.closeDialog();
      vms.app.notify('보낸 사실을 기록했어요. 판매처 답변이 오면 기록해 주세요.');
    },
  },
};
