import {AppError, reject} from './errors.mjs';
import {cleanText, parsePastDate} from './validation.mjs';
import {parseMoney} from './money.mjs';

export const RECEIPT_KINDS = Object.freeze({
  cash: '입금 확인',
  goods: '교환품 수령',
  repair: '수리 결과 확인',
  reversal: '기록 정정',
});

export function normalizeTransactionRef(value) {
  return cleanText(value, 100).normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

// Validates one "actually received" entry against the claim and its ledger.
// Cross-claim duplicate checks need the database and live in the service.
export function parseReceipt(claim, summary, ledger, input) {
  reject(input.confirmed !== true, '실제 내역과 선택한 증빙을 직접 확인했다는 체크가 필요합니다.');
  const note = cleanText(input.note, 2000);
  const receivedOn = parsePastDate(input.receivedOn);
  const base = {amount: 0, quantity: 0, reverses: null, transactionRef: '', note, receivedOn};

  switch (input.kind) {
    case 'reversal': {
      const original = ledger.find(entry => entry.id === input.reverses && entry.kind !== 'reversal');
      reject(!original || ledger.some(entry => entry.reverses === original.id) || note.length < 3, '정정할 기록과 사유(3자 이상)를 확인하세요.');
      return {...base, kind: 'reversal', amount: original.amount, quantity: original.quantity, reverses: original.id};
    }
    case 'cash': {
      reject(claim.kind !== 'refund' || claim.agreed === null, '환불 건은 합의액을 먼저 기록하세요.');
      const transactionRef = normalizeTransactionRef(input.transactionRef);
      reject(transactionRef && !/^[A-Z0-9_:./-]{3,100}$/.test(transactionRef), '거래 식별자 형식을 확인하세요.');
      const amount = parseMoney(input.amount, claim.currency);
      if (!transactionRef) {
        reject(input.missingReferenceConfirmed !== true || input.duplicateReviewed !== true || note.length < 10,
          '거래 식별자가 없으면 확인 메모(10자 이상)와 중복 검토 체크가 필요합니다.');
        reject(ledger.some(entry => entry.kind === 'cash' && entry.receivedOn === receivedOn && entry.amount === amount),
          '같은 날짜·금액의 입금이 이미 있어요. 거래 식별자를 확인하세요.', 'duplicate_suspected', 409);
      }
      reject(amount < 1 || amount > claim.agreed - summary.cash, '입금액은 아직 받지 못한 합의액 이내로 기록하세요.');
      return {...base, kind: 'cash', amount, transactionRef};
    }
    case 'goods': {
      const quantity = Number(input.quantity);
      reject(claim.kind !== 'exchange' || !Number.isInteger(quantity) || quantity < 1 || quantity > summary.requestedQty - summary.goods,
        '교환품 수령 수량을 확인하세요.');
      return {...base, kind: 'goods', quantity};
    }
    case 'repair':
      reject(claim.kind !== 'repair' || summary.repair, '수리 결과 기록을 확인하세요.');
      return {...base, kind: 'repair'};
    default:
      throw new AppError(422, 'validation', '회수 유형을 확인하세요.');
  }
}
