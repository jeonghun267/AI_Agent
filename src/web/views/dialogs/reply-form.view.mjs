import {html} from '../../core/html.mjs';
import {renderInto, formValues} from '../../core/dom.mjs';
import {choiceCards, formActions} from '../components/ui.view.mjs';
import {icon} from '../components/icons.view.mjs';

// [kind, short description, icon] in the order a person reads them.
const KINDS = [
  ['evidence', '자료를 더 보내 달래요', 'file'],
  ['agreement', '금액·방법을 제안했어요', 'coin'],
  ['refund_notice', '환불했다고 알려 왔어요', 'check'],
  ['denied', '받아들이지 않았어요', 'flag'],
  ['other', '그 밖의 답변', 'reply'],
];

// What recording each kind does to the claim, said before the user saves.
const EFFECT = {
  evidence: '진행 단계는 그대로예요. 기록한 뒤 요청받은 증빙을 올리고 새 문의를 보내세요.',
  agreement: '진행 단계는 그대로예요. 기록한 뒤 합의액을 입력하면 회수율을 계산해요.',
  refund_notice: '입금 확인 대기로 바뀌어요. 통지만으로는 회수로 치지 않아요. 실제 입금을 확인하면 회수 기록을 남기세요.',
  denied: '분쟁으로 바뀌어요. 근거를 보강해 다시 문의할 수 있어요.',
  other: '진행 단계는 그대로예요.',
};

// The AI's suggestion for what to do after each kind of reply.
const NEXT = {
  evidence: '요청받은 자료를 증빙에 올리고, 그 내용을 담은 새 문의를 보내세요.',
  agreement: '제안받은 조건이 괜찮다면 합의액을 입력하세요.',
  refund_notice: '카드·은행 내역에서 실제 입금을 확인한 뒤 회수 기록을 남기세요.',
  denied: '거절 이유를 확인하고, 증빙을 보강해 다시 문의하세요.',
  other: '내용을 읽고 필요한 조치를 정하세요.',
};

export function render(_, {session}) {
  const kinds = session.config.replyKinds;
  return {
    title: '판매처 답변 기록',
    body: html`<form id="reply-form">
      <div class="field full">
        <div class="label-row"><label for="reply-body">받은 답변 원문</label>
          ${session.ai.enabled ? html`<button class="btn small ai" type="button" data-action="analyze-reply">${icon('sparkle')}AI로 번역·분석</button>` : ''}</div>
        <textarea id="reply-body" name="body" required maxlength="8000" placeholder="판매처 메일이나 채팅 답변을 그대로 붙여 넣으세요…"></textarea>
        <small>번역하지 않고 원문 그대로 붙여 넣으면 돼요.</small>
      </div>
      <div data-ai-slot="reply"></div>
      <div id="reply-analysis"></div>
      <input type="hidden" name="translationKo" value="">
      <input type="hidden" name="summaryKo" value="">
      ${choiceCards('어떤 답변인가요?', 'kind', KINDS.filter(([key]) => kinds[key]).map(([key, description, iconName]) => [key, kinds[key], description, iconName]), 'other', {columns: 2})}
      <p class="effect-line" id="reply-effect" aria-live="polite">${icon('arrow')}<span>${EFFECT.other}</span></p>
      ${formActions('기록')}
    </form>`,
  };
}

function analysisView(result, kinds) {
  return html`<section class="ai-card" aria-label="AI 분석 결과">
    <header>${icon('sparkle')}<strong>AI 분석</strong><span class="tag ai">미리보기</span></header>
    <p class="ai-card-summary">${result.summaryKo}</p>
    <dl class="ai-facts">
      <div><dt>추천 유형</dt><dd>${kinds[result.suggestedKind]}</dd></div>
      ${result.mentionedAmount ? html`<div><dt>언급된 금액</dt><dd>${result.mentionedCurrency ?? ''} ${result.mentionedAmount}</dd></div>` : ''}
      ${result.deadline ? html`<div><dt>언급된 기한</dt><dd>${result.deadline}${result.deadlineQuote ? html`<small>"${result.deadlineQuote}"</small>` : ''}</dd></div>` : ''}
    </dl>
    <p class="ai-card-next"><strong>추천 다음 행동</strong>${NEXT[result.suggestedKind] ?? NEXT.other}</p>
    <details><summary>한국어 번역</summary><pre>${result.translationKo}</pre></details>
    <small>추천 유형을 아래에 미리 골라 뒀어요. 맞는지 확인하고 바꿔도 돼요.</small>
  </section>`;
}

function showEffect(form) {
  const kind = form.elements.kind.value || 'other';
  form.querySelector('#reply-effect span').textContent = EFFECT[kind] ?? EFFECT.other;
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
      showEffect(form);
    }),
  },
  change: {
    'form:reply-form': ({el}) => { if (el.name === 'kind') showEffect(el.form); },
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
