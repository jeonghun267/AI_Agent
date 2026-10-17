// Derived values for a claim: progress steps, recovery meter, the next thing
// to do and a readable activity feed (DESIGN.md §7). Pure functions of a claim
// view, so views stay simple and tests run in Node.
import {money} from '../core/format.mjs';

export const PROGRESS_STEPS = Object.freeze([
  {key: 'prepare', label: '자료 준비'},
  {key: 'inquiry', label: '문의'},
  {key: 'reply', label: '답변 대기'},
  {key: 'agree', label: '합의'},
  {key: 'recover', label: '회수'},
  {key: 'close', label: '종료'},
]);

const CLOSED_STATES = ['waived', 'completed'];
export const isOpen = claim => !claim.deleted && !CLOSED_STATES.includes(claim.state);

// Which step each claim state sits on. "recovered" means the money or goods
// arrived, so 회수 is done and only closing is left.
const STEP_OF_STATE = {preparing: 0, review: 1, awaiting: 2, negotiating: 3, disputed: 3, partial: 4, recovered: 5, completed: 6};

// 0-based index of the current step; 6 when everything is done, -1 when waived.
export const stepIndex = claim => claim.state === 'waived' ? -1 : STEP_OF_STATE[claim.state] ?? 0;

// steps: [{key, label, status: 'done' | 'current' | 'todo'}]
// flag: '' | 'disputed' (current step needs attention) | 'waived' (stopped)
export function selectProgress(claim) {
  if (claim.state === 'waived') {
    return {flag: 'waived', steps: PROGRESS_STEPS.map(step => ({...step, status: 'todo'}))};
  }
  const current = stepIndex(claim);
  return {
    flag: claim.state === 'disputed' ? 'disputed' : '',
    steps: PROGRESS_STEPS.map((step, index) => ({
      ...step,
      status: index < current ? 'done' : index === current ? 'current' : 'todo',
    })),
  };
}

// How much of what was asked for has actually come back.
//   refund:   money received / agreed amount (or the claimed amount before an agreement)
//   exchange: replacement items received / items claimed
//   repair:   0 or 1 confirmed repair
export function selectRecovery(claim) {
  const {summary} = claim;
  if (claim.kind === 'exchange') {
    return {unit: 'count', got: summary.goods, target: summary.requestedQty, percent: percentOf(summary.goods, summary.requestedQty), basis: ''};
  }
  if (claim.kind === 'repair') {
    return {unit: 'repair', got: summary.repair ? 1 : 0, target: 1, percent: summary.repair ? 100 : 0, basis: ''};
  }
  const target = claim.agreed ?? claim.claimed;
  return {
    unit: 'money',
    got: summary.cash,
    target,
    currency: claim.currency,
    percent: percentOf(summary.cash, target),
    basis: claim.agreed === null ? '청구액 기준' : '합의액 기준',
  };
}

function percentOf(got, target) {
  if (!target) return 0;
  return Math.min(100, Math.max(0, Math.round((got / target) * 100)));
}

// The one action that moves this claim forward, in the order a person would
// do it. key names the action (the view decides which button it is); tab is
// where that action lives; tone: 'default' | 'attention' | 'done' | 'muted'.
//   restore, done, reopen, close, dispute, upload, draft, stale, submit, reply, evidence, agree, receipt
export function selectNextAction(claim, {aiEnabled = false} = {}) {
  const latest = claim.drafts[0];
  const at = (key, tone, tab, title, body) => ({key, tone, tab, title, body});
  if (claim.deleted) return at('restore', 'muted', 'overview', '휴지통에 있는 건이에요', '복원하면 지난 기록을 그대로 두고 이어서 진행할 수 있어요.');
  if (claim.state === 'completed') return at('done', 'done', 'ledger', '종료된 건이에요', '회수 기록과 지난 활동은 그대로 남아 있어요.');
  if (claim.state === 'waived') return at('reopen', 'muted', 'overview', '포기로 기록한 건이에요', '다시 진행하려면 사유를 남기고 재개하세요.');
  if (claim.state === 'recovered') return at('close', 'done', 'ledger', '모두 돌려받았어요', '받은 내용을 한 번 더 확인하고 이 건을 종료하세요.');
  if (claim.state === 'disputed') return at('dispute', 'attention', 'inquiry', '판매처와 의견이 달라요', '근거를 보강한 문의를 다시 보내거나, 새 답변이 오면 기록하세요.');
  if (!claim.files.length) return at('upload', 'default', 'files', '증빙부터 올려 주세요', '주문 내역, 불량 사진 같은 자료가 있어야 문의하고 회수를 기록할 수 있어요.');
  if (!latest) {
    return at('draft', 'default', 'inquiry', '판매처에 보낼 문의를 준비하세요',
      aiEnabled ? 'AI가 저장된 사실로 영문 문의 초안을 써 드려요. 확인하고 고친 뒤 저장하세요.' : '저장된 사실로 영문 문의 틀을 채워 드려요. 확인하고 고친 뒤 저장하세요.');
  }
  if (!latest.submittedAt && latest.stale) return at('stale', 'attention', 'inquiry', '사건 정보가 바뀌었어요', '저장한 문의가 지금 정보와 달라요. 새 버전으로 고쳐 저장한 뒤 보내세요.');
  if (!latest.submittedAt) return at('submit', 'default', 'inquiry', '문의를 판매처에 보냈나요?', '문의 내용을 복사해 판매처 공식 문의 창구에 보낸 뒤, 보냈다고 기록하세요.');
  // Replies are stored newest first. Only a reply after the last sending answers it.
  const reply = claim.replies[0]?.recordedAt > latest.submittedAt ? claim.replies[0] : null;
  if (!reply && ['awaiting', 'review'].includes(claim.state)) return at('reply', 'default', 'replies', '판매처 답변을 기다리고 있어요', '답변이 오면 원문을 붙여 넣어 기록하세요. 진행 단계가 함께 바뀌어요.');
  if (reply?.kind === 'evidence') return at('evidence', 'attention', 'files', '판매처가 추가 증빙을 요청했어요', '요청받은 자료를 올리고, 그 내용을 담은 새 문의를 보내세요.');
  if (claim.kind === 'refund' && claim.agreed === null) return at('agree', 'default', 'overview', '합의한 금액이 정해졌나요?', '판매처와 합의한 금액을 입력하면 회수율을 정확히 계산하고 입금을 기록할 수 있어요.');
  if (reply?.kind === 'refund_notice' && claim.state === 'awaiting') return at('receipt', 'default', 'ledger', '환불 처리 통지를 받았어요', '카드·은행 내역에서 실제 입금을 확인하면 기록하세요. 통지만으로는 기록하지 않아요.');
  return at('receipt', 'default', 'ledger',
    claim.state === 'partial' ? '남은 금액을 기다리고 있어요' : '돌려받은 것이 있나요?',
    '카드·은행 내역이나 받은 물건을 확인한 뒤 기록하세요. 판매처의 통지만으로는 기록하지 않아요.');
}

// Home "지금 해야 할 일": what can be done now comes first, waiting comes last.
export const NEXT_PRIORITY = ['close', 'dispute', 'receipt', 'agree', 'evidence', 'submit', 'stale', 'draft', 'upload', 'reply'];

// A readable feed built from the claim's own records, newest first. Works on
// list responses too, which do not carry the change history.
//   labels: /api/config (replyKinds)
export function selectActivity(claim, labels) {
  const items = [{at: claim.createdAt, kind: 'create', text: '클레임 등록'}];
  for (const file of claim.files) items.push({at: file.createdAt, kind: 'file', text: `증빙 저장 · ${file.name}`});
  for (const draft of claim.drafts) {
    items.push({at: draft.createdAt, kind: 'draft', text: '문의 버전 저장'});
    if (draft.submittedAt) items.push({at: draft.submittedAt, kind: 'sent', text: '판매처에 문의 보냄'});
  }
  for (const reply of claim.replies) items.push({at: reply.recordedAt, kind: 'reply', text: `판매처 답변 기록 · ${labels.replyKinds[reply.kind] ?? reply.kind}`});
  for (const entry of claim.ledger) items.push({at: entry.createdAt, kind: entry.kind === 'reversal' ? 'reversal' : 'receipt', text: ledgerText(entry, claim.currency)});
  return items
    .filter(item => item.at)
    .map(item => ({...item, claimId: claim.id, claimTitle: claim.title}))
    .sort((a, b) => b.at.localeCompare(a.at));
}

function ledgerText(entry, currency) {
  if (entry.kind === 'cash') return `입금 확인 · ${money(entry.amount, currency)}`;
  if (entry.kind === 'goods') return `교환품 ${entry.quantity}개 수령`;
  if (entry.kind === 'repair') return '수리 결과 확인';
  return '회수 기록 정정';
}
