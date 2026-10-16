import {reject} from './errors.mjs';

// Amounts are stored as integers in the currency's minor unit
// (cents for USD, whole yen for JPY). Never mix currencies in one sum.
export const CURRENCIES = Object.freeze({
  USD: {digits: 2, label: '미국 달러'},
  EUR: {digits: 2, label: '유로'},
  GBP: {digits: 2, label: '영국 파운드'},
  JPY: {digits: 0, label: '일본 엔'},
  CNY: {digits: 2, label: '중국 위안'},
  KRW: {digits: 0, label: '한국 원'},
  CAD: {digits: 2, label: '캐나다 달러'},
  AUD: {digits: 2, label: '호주 달러'},
});

export function parseCurrency(code) {
  reject(!Object.hasOwn(CURRENCIES, code), '지원하는 통화 중에서 선택하세요.');
  return code;
}

export function parseMoney(value, currency) {
  const {digits} = CURRENCIES[parseCurrency(currency)];
  const text = String(value ?? '').trim().replaceAll(',', '');
  const pattern = digits ? new RegExp(`^\\d{1,10}(\\.\\d{1,${digits}})?$`) : /^\d{1,12}$/;
  reject(!pattern.test(text), digits
    ? `금액은 0 이상, 소수점 ${digits}자리까지 입력하세요.`
    : '금액은 0 이상의 정수로 입력하세요.');
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0);
  reject(!Number.isSafeInteger(minor), '금액이 너무 큽니다.');
  return minor;
}

export function toDecimal(minor, currency) {
  const {digits} = CURRENCIES[currency];
  return (minor / 10 ** digits).toFixed(digits);
}
