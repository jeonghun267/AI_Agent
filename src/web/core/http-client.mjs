// `field` names the input the server rejected (e.g. "claimedAmount",
// "items.0.unitPrice"), so the form can show the message next to it.
export class ApiError extends Error {
  constructor(message, code, status, field = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

// The only place that calls fetch. Adds the CSRF token to writes, retry keys
// (Idempotency-Key) and the claim version (If-Match) when given.
export function createHttpClient({onUnauthorized = () => {}} = {}) {
  let csrf = '';

  // `signal` (AbortController) lets the user cancel slow requests such as AI calls.
  async function request(path, {method = 'GET', data, raw, headers = {}, key, version, quiet = false, signal} = {}) {
    const sent = {...headers};
    if (data !== undefined) sent['Content-Type'] = 'application/json';
    if (method !== 'GET') sent['X-CSRF-Token'] = csrf;
    if (key) sent['Idempotency-Key'] = key;
    if (version !== undefined) sent['If-Match'] = String(version);

    let response;
    try {
      response = await fetch(path, {
        method,
        headers: sent,
        body: raw ?? (data === undefined ? undefined : JSON.stringify(data)),
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new ApiError('취소했어요.', 'cancelled', 0);
      throw new ApiError('서버에 연결하지 못했어요. 저장됐는지 확인한 뒤 같은 요청을 다시 시도하세요.', 'network', 0);
    }

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    let body;
    try {
      body = isJson ? await response.json() : await response.blob();
    } catch (error) {
      if (error?.name === 'AbortError') throw new ApiError('취소했어요.', 'cancelled', 0);
      throw error;
    }
    if (!response.ok) {
      if (response.status === 401 && !quiet) onUnauthorized();
      throw new ApiError(body?.message || '요청을 처리하지 못했어요.', body?.error || 'error', response.status, body?.field ?? null);
    }
    if (isJson && body?.csrf) csrf = body.csrf;
    return body;
  }

  return {
    request,
    setCsrf(token) { csrf = token || ''; },
  };
}

export const newRequestKey = () => crypto.randomUUID();
