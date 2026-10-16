// Every expected failure is an AppError. The HTTP layer turns it into
// { error: code, message, field? } with the given status; anything else becomes a 500.
// `field` names the input that was rejected ("claimedAmount", "items.0.unitPrice"),
// so the web app can show the message next to that input.
export class AppError extends Error {
  constructor(status, code, message, field = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    if (field) this.field = field;
  }
}

export function reject(condition, message, code = 'validation', status = 422) {
  if (condition) throw new AppError(status, code, message);
}

// Runs a validation step and tags any AppError it throws with the input name.
export function forField(field, check) {
  try {
    return check();
  } catch (error) {
    if (error instanceof AppError && !error.field) error.field = field;
    throw error;
  }
}

export function notFound(message = '요청한 항목을 찾을 수 없습니다.') {
  return new AppError(404, 'not_found', message);
}
