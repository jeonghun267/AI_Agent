import {readFile} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {reject} from '../domain/errors.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// Serves files under src/web. Unknown extensions and paths outside the root are 404.
export async function serveStatic(req, res, path, webRoot, headers) {
  reject(!['GET', 'HEAD'].includes(req.method), '지원하지 않는 요청입니다.', 'method_denied', 405);
  const relative = path === '/' ? '/index.html' : path;
  const filename = resolve(webRoot, '.' + relative);
  reject(!filename.startsWith(webRoot + sep) || !MIME[extname(filename)], '파일을 찾을 수 없습니다.', 'not_found', 404);
  const bytes = await readFile(filename);
  res.writeHead(200, {...headers, 'Content-Type': MIME[extname(filename)]});
  res.end(req.method === 'HEAD' ? undefined : bytes);
}
