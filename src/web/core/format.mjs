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

// Parses what the user typed ("39.9", "1,234.50") into minor units, or null
// when it is not a valid amount for the currency. Server rules still decide.
export function parseAmount(text, currency) {
  const digits = currencyDigits(currency);
  const value = String(text ?? '').replace(/,/g, '').trim();
  const pattern = digits ? new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`) : /^\d+$/;
  if (!pattern.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0);
}

// "10월 17일" for the current year, "2025년 10월 17일" otherwise.
// Plain YYYY-MM-DD dates are calendar days, read without a time zone shift.
export function shortDate(iso) {
  if (!iso) return '';
  const day = iso.length === 10;
  const date = new Date(day ? `${iso}T00:00:00Z` : iso);
  const zone = day ? 'UTC' : 'Asia/Seoul';
  const sameYear = date.getUTCFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('ko-KR', {timeZone: zone, ...(sameYear ? {} : {year: 'numeric'}), month: 'long', day: 'numeric'});
}

// "YYYY-MM" of the user's local calendar, for "this month" totals.
export const thisMonth = () => today().slice(0, 7);

export function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// The user's local calendar date (not UTC), as YYYY-MM-DD.
export function today() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}
