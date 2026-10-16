import {setTimeout as delay} from 'node:timers/promises';
import {AppError} from '../domain/errors.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const RETRY_DELAY_MS = 800;

const aiError = (status, code, message) => new AppError(status, code, message);
const ERRORS = {
  timeout: () => aiError(504, 'ai_timeout', 'AI 응답이 늦어지고 있어요. 잠시 후 다시 시도하세요.'),
  unreachable: () => aiError(502, 'ai_unreachable', 'AI 서비스에 연결하지 못했어요. 잠시 후 다시 시도하세요.'),
  busy: () => aiError(503, 'ai_busy', 'AI 서비스 사용량이 많아요. 잠시 후 다시 시도하세요.'),
  config: () => aiError(503, 'ai_config', 'AI 서비스 설정에 문제가 있어요. 운영자가 API 키와 모델 설정을 확인해야 합니다.'),
  rejected: () => aiError(502, 'ai_request_rejected', 'AI 서비스가 요청을 처리하지 못했어요. 내용을 줄이거나 다시 시도하세요.'),
  blocked: () => aiError(422, 'ai_blocked', 'AI 서비스가 이 내용을 처리하지 않았어요. 직접 작성해 주세요.'),
  badOutput: () => aiError(502, 'ai_bad_output', 'AI 응답 형식이 올바르지 않아요. 다시 시도해 주세요.'),
};

const toGeminiPart = part => part.file
  ? {inline_data: {mime_type: part.file.mime, data: part.file.bytes.toString('base64')}}
  : {text: part.text};

// Calls the Gemini REST API directly (no SDK). One retry on network errors,
// 429 and 5xx. Only status codes are surfaced; response bodies are not logged.
export function createGeminiProvider({apiKey, model, timeoutMs}, {fetchImpl = fetch} = {}) {
  async function post(body) {
    try {
      return await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'x-goog-api-key': apiKey},
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw error?.name === 'TimeoutError' || error?.name === 'AbortError' ? ERRORS.timeout() : ERRORS.unreachable();
    }
  }

  async function postWithRetry(body) {
    let response;
    try {
      response = await post(body);
    } catch (error) {
      if (error.code !== 'ai_unreachable') throw error;
    }
    if (response && response.status !== 429 && response.status < 500) return response;
    await delay(RETRY_DELAY_MS);
    return post(body);
  }

  async function generateJson({system, parts, schema, temperature = 0.2, maxOutputTokens = 4096}) {
    const response = await postWithRetry({
      systemInstruction: {parts: [{text: system}]},
      contents: [{role: 'user', parts: parts.map(toGeminiPart)}],
      generationConfig: {temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema},
    });
    if (response.status === 429) throw ERRORS.busy();
    if ([401, 403, 404].includes(response.status)) throw ERRORS.config();
    if (!response.ok) throw response.status >= 500 ? ERRORS.unreachable() : ERRORS.rejected();

    let payload;
    try { payload = await response.json(); } catch { throw ERRORS.badOutput(); }
    if (payload.promptFeedback?.blockReason) throw ERRORS.blocked();
    const candidate = payload.candidates?.[0];
    if (!candidate) throw ERRORS.badOutput();
    if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(candidate.finishReason)) throw ERRORS.blocked();
    if (candidate.finishReason && candidate.finishReason !== 'STOP') throw ERRORS.badOutput();

    const text = (candidate.content?.parts ?? []).filter(part => !part.thought).map(part => part.text ?? '').join('');
    let data;
    try { data = JSON.parse(text); } catch { throw ERRORS.badOutput(); }
    const usage = payload.usageMetadata ?? {};
    return {
      data,
      model,
      usage: {
        inputTokens: usage.promptTokenCount ?? 0,
        outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      },
    };
  }

  return {name: 'gemini', model, enabled: true, generateJson};
}
