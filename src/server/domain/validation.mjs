import {reject} from './errors.mjs';

export function cleanText(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

export function requireText(value, max, message) {
  const text = cleanText(value, max);
  reject(!text, message);
  return text;
}

export function parseDate(value, message = '날짜를 YYYY-MM-DD 형식으로 확인하세요.') {
  const text = String(value ?? '');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(text)
    && Number.isFinite(Date.parse(text))
    && new Date(text).toISOString().slice(0, 10) === text;
  reject(!valid, message);
  return text;
}

// Users pick dates in their own time zone, which can be up to 14 hours ahead
// of UTC (Korea is +9), so "today" for them may already be tomorrow in UTC.
export function parsePastDate(value) {
  const date = parseDate(value);
  const latestToday = new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
  reject(date > latestToday, '주문일·확인일은 미래 날짜일 수 없습니다.');
  return date;
}

export function parseInteger(value, {min, max}, message) {
  const number = Number(value);
  reject(!Number.isInteger(number) || number < min || number > max, message);
  return number;
}

export function parseEmail(value) {
  const email = cleanText(value, 200).toLowerCase();
  reject(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), '이메일 형식을 확인하세요.');
  return email;
}

export function parsePassword(value) {
  const password = String(value ?? '');
  reject(password.length < 10 || password.length > 200, '비밀번호는 10자 이상 200자 이하로 입력하세요.');
  return password;
}

export function parseOptionalUrl(value) {
  const text = cleanText(value, 300);
  if (!text) return '';
  let url = null;
  try { url = new URL(text); } catch { /* reported below */ }
  reject(!url || !['http:', 'https:'].includes(url.protocol), '판매처 주소는 http:// 또는 https:// 로 시작해야 합니다.');
  return url.href;
}
