import http from 'node:http';
import {openDatabase} from './repositories/db.mjs';
import {createRepositories} from './repositories/index.mjs';
import {createServices} from './services/index.mjs';
import {createAiProvider} from './ai/provider.mjs';
import {createRouter} from './http/router.mjs';
import {registerRoutes} from './routes/index.mjs';
import {createRateLimiter} from './http/rate-limit.mjs';
import {readBody, readJson, readCookie, readVersion, readIdempotencyKey, clientAddress, SESSION_COOKIE} from './http/request.mjs';
import {sendJson, sendFile, sendError} from './http/response.mjs';
import {securityHeaders, allowedHosts, expectedOrigin, enforceHost, enforceOrigin, enforceCsrf, sessionCookie} from './http/security.mjs';
import {serveStatic} from './http/static.mjs';
import {AppError} from './domain/errors.mjs';
import {newId} from './domain/primitives.mjs';
import {seedDemo} from './dev/seed.mjs';

// The one place where everything is wired together. Tests call createApp with
// a test config and, optionally, a fake AI provider.
export function createApp(config, {aiProvider = createAiProvider(config.ai), logger = console} = {}) {
  const db = openDatabase(config.dataDir);
  const repos = createRepositories(db);
  const services = createServices({db, repos, config, aiProvider});
  const limits = {
    login: createRateLimiter({limit: 8, windowMs: 5 * 60 * 1000}),
    signup: createRateLimiter({limit: 10, windowMs: 60 * 60 * 1000}),
  };
  const router = createRouter();
  registerRoutes(router, {services, config, limits});
  const ready = config.seedDemo ? seedDemo({services, repos}) : Promise.resolve();

  let hosts = allowedHosts(config, config.port);
  const server = http.createServer((req, res) => handle(req, res));
  const sessionSweep = setInterval(() => services.auth.cleanupExpiredSessions(), 60 * 60 * 1000);
  sessionSweep.unref();

  async function handle(req, res) {
    const requestId = newId();
    const headers = securityHeaders(requestId, config);
    try {
      enforceHost(req, hosts);
      const url = new URL(req.url, `http://${req.headers.host}`);
      let path;
      try { path = decodeURIComponent(url.pathname); } catch { throw new AppError(400, 'invalid_path', '주소를 확인하세요.'); }
      const isWrite = !['GET', 'HEAD'].includes(req.method);
      if (isWrite) enforceOrigin(req, expectedOrigin(config, req.headers.host));

      if (!path.startsWith('/api/')) {
        await serveStatic(req, res, path, config.webRoot, headers);
        return;
      }

      const {route, params, pathMatched} = router.match(req.method, path);
      if (!route) {
        throw pathMatched
          ? new AppError(405, 'method_denied', '지원하지 않는 요청입니다.')
          : new AppError(404, 'not_found', '요청을 찾을 수 없습니다.');
      }

      const ctx = createContext(req, res, url, params, headers);
      if (route.options.auth) {
        const session = services.auth.resolveSession(ctx.sessionToken);
        if (!session) throw new AppError(401, 'session_expired', '로그인이 필요해요. 다시 로그인해 주세요.');
        if (isWrite) enforceCsrf(req, session.csrf);
        ctx.user = session.user;
        ctx.csrf = session.csrf;
        if (session.renewed) ctx.setSession({token: ctx.sessionToken, maxAgeSeconds: session.maxAgeSeconds});
      }

      const result = await route.handler(ctx);
      const responseHeaders = {...headers, ...ctx.responseHeaders, ...result.headers};
      if (result.file) sendFile(res, result.file, responseHeaders);
      else sendJson(res, result.status ?? 200, result.body, responseHeaders);
    } catch (error) {
      sendError(res, error, headers, requestId, logger);
    }
  }

  // Per-request helpers handed to route handlers.
  function createContext(req, res, url, params, headers) {
    const ctx = {
      req,
      params,
      query: url.searchParams,
      ip: clientAddress(req),
      version: readVersion(req),
      idempotencyKey: readIdempotencyKey(req),
      sessionToken: readCookie(req, SESSION_COOKIE),
      responseHeaders: {},
      user: null,
      csrf: null,
      header: name => req.headers[name],
      json: () => readJson(req),
      raw: limit => readBody(req, limit),
      setSession(session) {
        ctx.responseHeaders['Set-Cookie'] = sessionCookie(SESSION_COOKIE, session.token, {maxAgeSeconds: session.maxAgeSeconds, secure: config.isProduction});
      },
      clearSession() {
        ctx.responseHeaders['Set-Cookie'] = sessionCookie(SESSION_COOKIE, '', {maxAgeSeconds: 0, secure: config.isProduction});
      },
    };
    return ctx;
  }

  return {
    server,
    db,
    repos,
    services,
    ready,
    async listen(port = config.port, host = config.host) {
      await ready;
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      const actualPort = server.address().port;
      hosts = allowedHosts(config, actualPort);
      return `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`;
    },
    async close() {
      clearInterval(sessionSweep);
      await new Promise(resolve => server.close(resolve));
      db.close();
    },
  };
}
