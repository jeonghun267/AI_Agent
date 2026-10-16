import {timingSafeEqual} from 'node:crypto';
import {reject} from '../domain/errors.mjs';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

export function securityHeaders(requestId, config) {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': CSP,
    'X-Frame-Options': 'DENY',
    'X-Request-Id': requestId,
    ...(config.isProduction ? {'Strict-Transport-Security': 'max-age=31536000'} : {}),
  };
}

// In development the server only answers on loopback with its real port.
// In production it only answers to the public host in APP_ORIGIN.
export function allowedHosts(config, listeningPort) {
  if (config.isProduction) return [new URL(config.appOrigin).host];
  return [`127.0.0.1:${listeningPort}`, `localhost:${listeningPort}`];
}

export function expectedOrigin(config, host) {
  return config.isProduction ? config.appOrigin : `http://${host}`;
}

export function enforceHost(req, hosts) {
  reject(!hosts.includes(req.headers.host || ''), '허용된 주소로 접속하세요.', 'invalid_host', 403);
}

export function enforceOrigin(req, origin) {
  reject(req.headers.origin !== origin, '요청 출처를 확인할 수 없습니다.', 'origin_denied', 403);
}

export function enforceCsrf(req, csrf) {
  const sent = req.headers['x-csrf-token'];
  const same = typeof sent === 'string'
    && Buffer.byteLength(sent) === Buffer.byteLength(csrf)
    && timingSafeEqual(Buffer.from(sent), Buffer.from(csrf));
  reject(!same, '로그인 상태를 다시 확인하세요.', 'csrf_denied', 403);
}

export function sessionCookie(name, token, {maxAgeSeconds, secure}) {
  return `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}
