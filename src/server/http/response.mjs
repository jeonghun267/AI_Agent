import {AppError} from '../domain/errors.mjs';

export function sendJson(res, status, value, headers = {}) {
  res.writeHead(status, {...headers, 'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(value));
}

export function sendFile(res, file, headers = {}) {
  res.writeHead(200, {
    ...headers,
    'Content-Type': file.mime,
    'Content-Length': file.bytes.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
  });
  res.end(file.bytes);
}

// Maps an error to a safe response. Unexpected errors are logged with the
// request id and answered with a generic message; details never leak.
export function sendError(res, error, headers, requestId, logger) {
  if (error instanceof AppError) {
    sendJson(res, error.status, {error: error.code, message: error.message, requestId}, headers);
    return;
  }
  if (String(error?.message).includes('UNIQUE constraint failed')) {
    sendJson(res, 409, {error: 'conflict', message: '같은 내용이 이미 저장되어 있습니다. 최신 정보를 확인하세요.', requestId}, headers);
    return;
  }
  if (error?.code === 'ENOENT') {
    sendJson(res, 404, {error: 'not_found', message: '파일을 찾을 수 없습니다.', requestId}, headers);
    return;
  }
  logger.error(`[${requestId}]`, error);
  sendJson(res, 500, {error: 'server_error', message: '처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.', requestId}, headers);
}
