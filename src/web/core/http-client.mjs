export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// The only place that calls fetch. Adds the CSRF token to writes, retry keys
// (Idempotency-Key) and the claim version (If-Match) when given.
export function createHttpClient({onUnauthorized = () => {}} = {}) {
  let csrf = '';

  async function request(path, {method = 'GET', data, raw, headers = {}, key, version, quiet = false} = {}) {
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
      });
    } catch {
      throw new ApiError('서버에 연결하지 못했어요. 저장됐는지 확인한 뒤 같은 요청을 다시 시도하세요.', 'network', 0);
    }

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    const body = isJson ? await response.json() : await response.blob();
    if (!response.ok) {
      if (response.status === 401 && !quiet) onUnauthorized();
      throw new ApiError(body?.message || '요청을 처리하지 못했어요.', body?.error || 'error', response.status);
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
