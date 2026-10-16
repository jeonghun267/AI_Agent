import {AppError} from '../domain/errors.mjs';

// Helpers to re-validate model output on the server. The response schema asks
// the model for a shape; these make sure we only pass on what we expect.
export function badOutput() {
  return new AppError(502, 'ai_bad_output', 'AI 응답 형식이 올바르지 않아요. 다시 시도해 주세요.');
}

export function requiredString(value, max) {
  if (typeof value !== 'string' || !value.trim()) throw badOutput();
  return value.trim().slice(0, max);
}

export function optionalString(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export function stringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) throw badOutput();
  return value.filter(item => typeof item === 'string' && item.trim()).slice(0, maxItems).map(item => item.trim().slice(0, maxLength));
}

// Facts are sent as JSON inside a clearly delimited block so the model can
// tell user data apart from instructions.
export function factsBlock(label, value) {
  return `<${label}>\n${JSON.stringify(value, null, 2)}\n</${label}>`;
}
