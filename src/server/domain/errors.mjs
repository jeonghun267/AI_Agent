// Every expected failure is an AppError. The HTTP layer turns it into
// { error: code, message } with the given status; anything else becomes a 500.
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function reject(condition, message, code = 'validation', status = 422) {
  if (condition) throw new AppError(status, code, message);
}

export function notFound(message = '요청한 항목을 찾을 수 없습니다.') {
  return new AppError(404, 'not_found', message);
}
