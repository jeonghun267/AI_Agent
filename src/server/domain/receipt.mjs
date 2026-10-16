import {AppError, reject, forField} from './errors.mjs';
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
// Errors name the receipt form input they belong to (forField).
export function parseReceipt(claim, summary, ledger, input) {
  const note = cleanText(input.note, 2000);
  const receivedOn = forField('receivedOn', () => parsePastDate(input.receivedOn));
  const base = {amount: 0, quantity: 0, reverses: null, transactionRef: '', note, receivedOn};
  let entry;

  switch (input.kind) {
    case 'reversal': {
      const original = ledger.find(item => item.id === input.reverses && item.kind !== 'reversal');
      reject(!original || ledger.some(item => item.reverses === original.id), '정정할 기록을 찾지 못했어요. 이미 정정된 기록일 수 있어요.');
      forField('note', () => reject(note.length < 3, '정정 사유를 3자 이상 남겨 주세요.'));
      entry = {...base, kind: 'reversal', amount: original.amount, quantity: original.quantity, reverses: original.id};
      break;
    }
    case 'cash': {
      reject(claim.kind !== 'refund' || claim.agreed === null, '환불 건은 합의액을 먼저 기록하세요.');
      const amount = forField('amount', () => parseMoney(input.amount, claim.currency));
      const transactionRef = normalizeTransactionRef(input.transactionRef);
      forField('transactionRef', () => {
        reject(transactionRef && !/^[A-Z0-9_:./-]{3,100}$/.test(transactionRef), '거래 식별자는 영문·숫자와 - _ : . / 만 쓸 수 있어요.');
        if (transactionRef) return;
        reject(input.missingReferenceConfirmed !== true || input.duplicateReviewed !== true || note.length < 10,
          '거래 식별자가 없으면 아래 두 확인 체크와 메모(10자 이상)가 필요해요.');
        reject(ledger.some(item => item.kind === 'cash' && item.receivedOn === receivedOn && item.amount === amount),
          '같은 날짜·금액의 입금이 이미 있어요. 거래 식별자를 확인하세요.', 'duplicate_suspected', 409);
      });
      forField('amount', () => reject(amount < 1 || amount > claim.agreed - summary.cash, '입금액은 아직 받지 못한 합의액 이내로 기록하세요.'));
      entry = {...base, kind: 'cash', amount, transactionRef};
      break;
    }
    case 'goods': {
      const quantity = Number(input.quantity);
      forField('quantity', () => reject(claim.kind !== 'exchange' || !Number.isInteger(quantity) || quantity < 1 || quantity > summary.requestedQty - summary.goods,
        `받은 교환품 수량은 1~${summary.requestedQty - summary.goods}개로 입력하세요.`));
      entry = {...base, kind: 'goods', quantity};
      break;
    }
    case 'repair':
      reject(claim.kind !== 'repair' || summary.repair, '수리 결과 기록을 확인하세요.');
      entry = {...base, kind: 'repair'};
      break;
    default:
      throw new AppError(422, 'validation', '회수 유형을 확인하세요.');
  }

  forField('confirmed', () => reject(input.confirmed !== true, '실제 내역과 선택한 증빙을 직접 확인했다는 체크가 필요해요.'));
  return entry;
}
