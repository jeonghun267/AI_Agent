import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {AppError} from '../domain/errors.mjs';

const ENDPOINT = 'https://api.resend.com/emails';
// Resend rejects requests without a User-Agent (403, error 1010).
const USER_AGENT = 'relo-server';

// detail carries Resend's error name (e.g. validation_error) for the log; never the key.
function mailError(status, code, message, detail = '') {
  const error = new AppError(status, code, message);
  error.detail = detail;
  return error;
}
const ERRORS = {
  unreachable: detail => mailError(502, 'mail_unreachable', '메일 서비스에 연결하지 못했어요. 잠시 후 다시 시도하세요.', detail),
  busy: detail => mailError(503, 'mail_busy', '메일 서비스 사용량이 많아요. 잠시 후 다시 시도하세요.', detail),
  config: detail => mailError(503, 'mail_config', '메일 서비스 설정에 문제가 있어요. 운영자가 RESEND_API_KEY와 발신 주소(MAIL_FROM)를 확인해야 합니다.', detail),
  rejected: detail => mailError(502, 'mail_rejected', '메일 서비스가 이 메일을 받지 않았어요.', detail),
};

async function errorName(response) {
  try { return String((await response.json())?.name ?? '').slice(0, 60); } catch { return ''; }
}

// Calls the Resend REST API directly (no SDK). One retry on network errors,
// timeouts, 429 and 5xx, with the same Idempotency-Key so a retry never sends
// the message twice. Only status codes and Resend's error name are surfaced.
export function createResendProvider({apiKey, from, timeoutMs}, {fetchImpl = fetch, retryDelayMs = 800} = {}) {
  async function post(body, idempotencyKey) {
    try {
      return await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': USER_AGENT,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return null;
    }
  }

  async function send({to, subject, text}) {
    const body = {from, to: [to], subject, text};
    const idempotencyKey = randomUUID();
    let response = await post(body, idempotencyKey);
    if (!response || response.status === 429 || response.status >= 500) {
      await delay(retryDelayMs);
      response = await post(body, idempotencyKey);
    }
    if (!response) throw ERRORS.unreachable();
    if (response.ok) return;
    const detail = await errorName(response);
    if (response.status === 429) throw ERRORS.busy(detail);
    if ([401, 403].includes(response.status)) throw ERRORS.config(detail);
    throw response.status >= 500 ? ERRORS.unreachable(detail) : ERRORS.rejected(detail);
  }

  return {name: 'resend', enabled: true, send};
}
