// Display formatting. Amounts arrive from the API as integers in the
// currency's minor unit; Intl knows how many decimals each currency uses.
const digitsCache = new Map();

export function currencyDigits(currency) {
  if (!digitsCache.has(currency)) {
    digitsCache.set(currency, new Intl.NumberFormat('en', {style: 'currency', currency}).resolvedOptions().maximumFractionDigits);
  }
  return digitsCache.get(currency);
}

export function money(minor, currency) {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat('ko-KR', {style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits})
    .format((minor || 0) / 10 ** digits);
}

// For form fields: 3990 EUR -> "39.90"; null -> "".
export function decimal(minor, currency) {
  if (minor === null || minor === undefined) return '';
  const digits = currencyDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

export function dateTime(iso) {
  return iso ? new Date(iso).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short'}) : '';
}

export function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// The user's local calendar date (not UTC), as YYYY-MM-DD.
export function today() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
