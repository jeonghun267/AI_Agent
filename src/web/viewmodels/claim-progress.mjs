// Derived values for the progress steps and the recovery meter (DESIGN.md §7).
// Pure functions of a claim view, so views stay simple and tests run in Node.

export const PROGRESS_STEPS = Object.freeze([
  {key: 'prepare', label: '자료 준비'},
  {key: 'inquiry', label: '문의'},
  {key: 'reply', label: '답변 대기'},
  {key: 'agree', label: '합의'},
  {key: 'recover', label: '회수'},
  {key: 'close', label: '종료'},
]);

// Which step each claim state sits on. "recovered" means the money or goods
// arrived, so 회수 is done and only closing is left.
const STEP_OF_STATE = {preparing: 0, review: 1, awaiting: 2, negotiating: 3, disputed: 3, partial: 4, recovered: 5, completed: 6};

// steps: [{key, label, status: 'done' | 'current' | 'todo'}]
// flag: '' | 'disputed' (current step needs attention) | 'waived' (stopped)
export function selectProgress(claim) {
  if (claim.state === 'waived') {
    return {flag: 'waived', steps: PROGRESS_STEPS.map(step => ({...step, status: 'todo'}))};
  }
  const current = STEP_OF_STATE[claim.state] ?? 0;
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
