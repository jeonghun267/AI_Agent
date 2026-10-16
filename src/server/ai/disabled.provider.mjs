import {AppError} from '../domain/errors.mjs';

// Used when no GEMINI_API_KEY is configured. The web app hides AI buttons and
// falls back to the rule-based draft.
export function createDisabledProvider() {
  return {
    name: 'disabled',
    model: '',
    enabled: false,
    async generateJson() {
      throw new AppError(503, 'ai_disabled', 'AI 기능이 아직 설정되지 않았어요. 운영자가 GEMINI_API_KEY를 설정해야 합니다.');
    },
  };
}
