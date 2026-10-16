import {html} from '../../core/html.mjs';
import {renderInto, formValues} from '../../core/dom.mjs';
import {selectField, formActions} from '../components/ui.view.mjs';

export function render(_, {session}) {
  return {
    title: '판매처 답변 기록',
    body: html`<form id="reply-form">
      <div class="field full">
        <div class="label-row"><label for="reply-body">받은 답변 원문</label>
          ${session.ai.enabled ? html`<button class="btn small" type="button" data-action="analyze-reply">AI로 번역·분석</button>` : ''}</div>
        <textarea id="reply-body" name="body" required maxlength="8000" placeholder="판매처 메일이나 채팅 답변을 그대로 붙여 넣으세요…"></textarea>
      </div>
      <div data-ai-slot="reply"></div>
      <div id="reply-analysis"></div>
      <input type="hidden" name="translationKo" value="">
      <input type="hidden" name="summaryKo" value="">
      ${selectField('답변 내용', 'kind', Object.entries(session.config.replyKinds), 'other', {full: true})}
      <p class="status-line">고른 내용에 따라 진행 상태가 바뀌어요. 거절은 분쟁, 환불 처리 통지는 입금 확인 대기로 기록돼요.</p>
      ${formActions('기록')}
    </form>`,
  };
}

function analysisView(result, kinds) {
  return html`<div class="ai-note">
    <strong>AI 분석 · 추천: ${kinds[result.suggestedKind]}</strong>
    <p>${result.summaryKo}</p>
    ${result.mentionedAmount ? html`<p>언급된 금액: ${result.mentionedCurrency ?? ''} ${result.mentionedAmount}</p>` : ''}
    ${result.deadline ? html`<p>언급된 기한: ${result.deadline} · "${result.deadlineQuote}"</p>` : ''}
    <details><summary>한국어 번역</summary><pre>${result.translationKo}</pre></details>
    <small>추천 유형을 아래에 미리 골라 뒀어요. 맞는지 확인하고 바꿔도 돼요.</small>
  </div>`;
}

export const handlers = {
  click: {
    'analyze-reply': ({el, vms}) => vms.ai.ensureConsent(async () => {
      const form = el.closest('form');
      const body = form.elements.body.value;
      const result = await vms.ai.analyzeReply(vms.detail.state.claim.id, body);
      renderInto(form.querySelector('#reply-analysis'), analysisView(result, vms.session.state.config.replyKinds));
      form.elements.kind.value = result.suggestedKind;
      form.elements.translationKo.value = result.translationKo;
      form.elements.summaryKo.value = result.summaryKo;
      form.dataset.analyzedBody = body;
      form.dataset.dirty = 'true';
    }),
  },
  submit: {
    'reply-form': async ({form, vms}) => {
      const values = formValues(form);
      // A translation only belongs to the exact text that was analyzed.
      const aiAssisted = !!form.dataset.analyzedBody && form.dataset.analyzedBody === values.body;
      await vms.detail.recordReply({
        body: values.body,
        kind: values.kind,
        translationKo: aiAssisted ? values.translationKo : '',
        summaryKo: aiAssisted ? values.summaryKo : '',
        aiAssisted,
      });
      vms.app.closeDialog();
      vms.app.notify('답변을 기록했어요.');
    },
  },
};
