import {html} from '../../core/html.mjs';

// Inline "AI is working" row shown right under the control that started it
// (DESIGN.md §9). Real Gemini calls take about 7–19 seconds, so the row says
// what is happening, counts seconds and offers a cancel button.
const LABEL = {
  translate: 'AI가 영문 설명을 쓰는 중…',
  reply: 'AI가 판매처 답변을 번역·분석하는 중…',
  extract: 'AI가 주문서를 읽는 중…',
};

export const SLOW_AFTER_SECONDS = 20;

export function aiHint(seconds) {
  return seconds >= SLOW_AFTER_SECONDS ? '평소보다 오래 걸리고 있어요. 계속 기다리거나 취소할 수 있어요.' : '보통 10초 안팎 걸려요.';
}

export function aiProgress(ai, kind) {
  if (ai.busy !== kind) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ai.startedAt) / 1000));
  return html`<div class="ai-progress" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true"></span>
    <div class="ai-progress-text"><strong>${LABEL[kind]}</strong><small data-ai-hint>${aiHint(seconds)}</small></div>
    <span class="ai-elapsed" data-ai-elapsed>${seconds}초</span>
    <button class="btn small ghost" type="button" data-action="cancel-ai">취소</button>
  </div>`;
}
