import {AppError, reject} from '../domain/errors.mjs';

export const JSON_LIMIT = 1024 * 1024;
export const SESSION_COOKIE = 'relo_session';

export async function readBody(req, limit = JSON_LIMIT) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    reject(size > limit, '요청 크기를 줄여 주세요.', 'too_large', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  try {
    const text = (await readBody(req)).toString();
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'invalid_json', '요청 형식을 확인하세요.');
  }
}

export function readCookie(req, name = SESSION_COOKIE) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// If-Match carries the claim version the client last saw.
export function readVersion(req) {
  const raw = String(req.headers['if-match'] || '').replaceAll('"', '');
  return raw === '' ? NaN : Number(raw);
}

export function readIdempotencyKey(req) {
  return req.headers['idempotency-key'] || '';
}

export function clientAddress(req) {
  return req.socket.remoteAddress || 'unknown';
}
