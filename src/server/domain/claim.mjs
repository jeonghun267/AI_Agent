import {reject} from './errors.mjs';
import {cleanText, requireText, parseDate, parsePastDate, parseOptionalUrl, parseInteger} from './validation.mjs';
import {parseCurrency, parseMoney} from './money.mjs';
import {sha256} from './primitives.mjs';

export const CLAIM_KINDS = Object.freeze({refund: '반품·환불', exchange: '교환', repair: 'AS'});

export const STATES = Object.freeze({
  preparing: '자료 준비',
  review: '문의 검토',
  awaiting: '판매처 답변 대기',
  negotiating: '합의 진행',
  partial: '부분 회수',
  disputed: '분쟁',
  waived: '포기',
  recovered: '회수 확인',
  completed: '종료',
});

export const CLOSED_STATES = Object.freeze(['waived', 'completed']);

export const REPLY_KINDS = Object.freeze({
  evidence: '추가 증빙 요청',
  agreement: '합의 안내',
  refund_notice: '환불 처리 통지',
  denied: '거절·분쟁',
  other: '기타',
});

export const DEADLINE_ZONES = Object.freeze([
  'Asia/Seoul', 'UTC', 'America/Los_Angeles', 'America/New_York',
  'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
]);

const MAX_ITEMS = 30;

// Validates the user-editable facts of a claim. Returns the stored payload.
export function parseClaimInput(input = {}) {
  const currency = parseCurrency(input.currency);
  reject(!Object.hasOwn(CLAIM_KINDS, input.kind), '반품·환불, 교환, AS 중 하나를 선택하세요.');
  const items = parseItems(input.items, currency);
  const claimed = parseMoney(input.claimedAmount, currency);
  reject(claimed === 0, '청구액은 0보다 커야 합니다.');
  const agreed = input.agreedAmount === '' || input.agreedAmount == null ? null : parseMoney(input.agreedAmount, currency);
  reject(agreed !== null && agreed > claimed, '합의액은 청구액보다 클 수 없습니다.');
  const deadline = input.deadline ? parseDate(input.deadline) : null;
  const deadlineQuote = cleanText(input.deadlineQuote, 1000);
  reject(deadline && !deadlineQuote, '기한은 판매처 원문 근거와 함께 기록하세요.');
  return {
    title: requireText(input.title, 150, '상품명을 입력하세요.'),
    vendor: requireText(input.vendor, 100, '판매처를 입력하세요.'),
    vendorUrl: parseOptionalUrl(input.vendorUrl),
    orderRef: requireText(input.orderRef, 100, '주문번호를 입력하세요.'),
    orderedOn: parsePastDate(input.orderedOn),
    kind: input.kind,
    currency,
    items,
    claimed,
    agreed,
    issue: requireText(input.issue, 3000, '문제 설명을 입력하세요.'),
    issueEnglish: cleanText(input.issueEnglish, 3000),
    deadline,
    deadlineQuote,
    deadlineZone: DEADLINE_ZONES.includes(input.deadlineZone) ? input.deadlineZone : 'Asia/Seoul',
  };
}

function parseItems(items, currency) {
  reject(!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS, `품목을 1~${MAX_ITEMS}개 입력하세요.`);
  return items.map(item => {
    const orderedQty = parseInteger(item.orderedQty, {min: 1, max: 10000}, '주문 수량을 확인하세요.');
    const claimQty = parseInteger(item.claimQty, {min: 1, max: orderedQty}, '문제 수량은 1 이상, 주문 수량 이하로 입력하세요.');
    return {
      name: requireText(item.name, 150, '품목명을 입력하세요.'),
      sku: cleanText(item.sku, 100),
      orderedQty,
      claimQty,
      unitPrice: parseMoney(item.unitPrice, currency),
    };
  });
}

export function requestedQuantity(claim) {
  return claim.items.reduce((sum, item) => sum + item.claimQty, 0);
}

// Sums what was actually recovered. Reversal entries copy the amount/quantity
// of the entry they cancel, so subtracting them undoes it.
export function totals(claim, ledger) {
  const reversed = new Set(ledger.filter(entry => entry.reverses).map(entry => entry.reverses));
  let cash = 0;
  let goods = 0;
  for (const entry of ledger) {
    if (entry.kind === 'cash') cash += entry.amount;
    if (entry.kind === 'goods') goods += entry.quantity;
    if (entry.kind === 'reversal') { cash -= entry.amount; goods -= entry.quantity; }
  }
  const repair = ledger.some(entry => entry.kind === 'repair' && !reversed.has(entry.id));
  return {
    cash,
    goods,
    repair,
    remaining: Math.max(0, (claim.agreed ?? claim.claimed) - cash),
    requestedQty: requestedQuantity(claim),
  };
}

export function isRecovered(claim, summary) {
  if (claim.kind === 'refund') return claim.agreed !== null && claim.agreed > 0 && summary.cash === claim.agreed;
  if (claim.kind === 'exchange') return summary.goods === summary.requestedQty;
  return summary.repair;
}

export function stateAfterReceipt(currentState, claim, summary) {
  if (currentState === 'disputed') return 'disputed';
  if (isRecovered(claim, summary)) return 'recovered';
  return summary.cash || summary.goods ? 'partial' : 'negotiating';
}

export function stateAfterReply(kind, currentState) {
  if (kind === 'denied') return 'disputed';
  if (kind === 'refund_notice') return 'awaiting';
  return currentState;
}

export const TRANSITIONS = Object.freeze(['awaiting', 'negotiating', 'disputed', 'waived', 'reopen', 'close']);

export function nextStateForTransition(action, claim, currentState, summary) {
  if (action === 'reopen') {
    reject(!['waived', 'disputed', 'completed'].includes(currentState), '지금 상태에서는 재개할 수 없습니다.');
    if (isRecovered(claim, summary)) return 'recovered';
    return summary.cash || summary.goods ? 'partial' : 'negotiating';
  }
  if (action === 'close') {
    reject(!isRecovered(claim, summary), '합의액 입금이나 교환·수리 결과를 실제로 확인한 뒤에 종료할 수 있습니다.');
    return 'completed';
  }
  reject(!['awaiting', 'negotiating', 'disputed', 'waived'].includes(action), '지원하지 않는 상태 변경입니다.');
  reject(CLOSED_STATES.includes(currentState), '먼저 사유를 남기고 재개하세요.');
  return action;
}

// A hash of the facts an inquiry draft was written from. When it changes,
// earlier drafts are marked stale and must be rewritten before sending.
export function factualFingerprint(claim, files) {
  return sha256(JSON.stringify({
    title: claim.title,
    vendor: claim.vendor,
    orderRef: claim.orderRef,
    issue: claim.issue,
    issueEnglish: claim.issueEnglish,
    kind: claim.kind,
    items: claim.items,
    claimed: claim.claimed,
    agreed: claim.agreed,
    currency: claim.currency,
    files: files.map(file => [file.id, file.sha]).sort(),
  }));
}

export function nextStep(view) {
  if (view.deleted) return '휴지통에 있어요. 복원하면 이어서 진행할 수 있어요.';
  if (view.state === 'waived') return '포기로 기록했어요. 필요하면 사유를 남기고 다시 진행하세요.';
  if (view.state === 'disputed') return '쟁점과 근거를 추가하고 판매처와 다음 조건을 정리하세요.';
  if (view.state === 'completed') return '종료된 건이에요. 회수 기록을 확인하세요.';
  if (view.state === 'recovered') return '실제 회수를 확인했어요. 내용을 검토하고 종료하세요.';
  if (view.summary.remaining && view.summary.cash) return '남은 금액과 판매처 기한을 확인하세요.';
  if (view.state === 'awaiting') return '판매처 답변이 오면 기록하고 합의 조건을 갱신하세요.';
  if (!view.files.length) return '주문 내역·불량 사진 같은 증빙을 올려 주세요.';
  if (!view.drafts.length) return '판매처에 보낼 문의를 준비하세요.';
  if (view.agreed === null) return '판매처와 합의한 금액이 정해지면 기록하세요.';
  return '실제 입금·수령을 증빙과 함께 기록하세요.';
}
