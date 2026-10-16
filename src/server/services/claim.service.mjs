import {transaction} from '../repositories/db.mjs';
import {reject, notFound, forField} from '../domain/errors.mjs';
import {newId, nowIso} from '../domain/primitives.mjs';
import {cleanText} from '../domain/validation.mjs';
import {
  parseClaimInput, totals, requestedQuantity, factualFingerprint, nextStep,
  nextStateForTransition, CLOSED_STATES,
} from '../domain/claim.mjs';
import {withIdempotency} from './idempotency.mjs';

// Claim lifecycle plus the helpers other claim-related services share:
// requireRow / expectVersion / requireOpen / mutate / detail.
export function createClaimService(ctx) {
  const {db, repos} = ctx;

  function requireRow(ownerId, claimId, {includeDeleted = false} = {}) {
    const row = repos.claims.findRow(ownerId, claimId, {includeDeleted});
    if (!row) throw notFound('사건을 찾을 수 없습니다.');
    return row;
  }

  function expectVersion(row, version) {
    reject(!Number.isInteger(version) || version !== row.version,
      '다른 화면에서 먼저 저장됐어요. 최신 내용을 불러와 다시 확인하세요.', 'conflict', 409);
  }

  function requireOpen(row) {
    reject(CLOSED_STATES.includes(row.state), '종료·포기한 건이에요. 먼저 사유를 남기고 재개하세요.');
  }

  // The shape the API returns: stored facts + files, ledger, drafts, history.
  function toView(ownerId, row, {withEvents = true} = {}) {
    const files = repos.files.listForClaim(ownerId, row.id);
    const ledger = repos.ledger.listForClaim(ownerId, row.id);
    const fingerprint = factualFingerprint(row.payload, files);
    const proofIds = new Set(ledger.map(entry => entry.proofId));
    const view = {
      ...row.payload,
      replies: row.payload.replies ?? [],
      id: row.id,
      state: row.state,
      version: row.version,
      dataRev: row.dataRev,
      deleted: !!row.deletedAt,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      files: files.map(file => ({...file, usedAsProof: proofIds.has(file.id)})),
      ledger,
      drafts: repos.drafts.listForClaim(ownerId, row.id).map(draft => ({
        ...draft,
        stale: draft.dataRev !== row.dataRev || draft.fingerprint !== fingerprint,
      })),
      events: withEvents ? repos.audit.listForEntity(ownerId, row.id) : [],
      summary: totals(row.payload, ledger),
    };
    view.nextStep = nextStep(view);
    return view;
  }

  function detail(ownerId, claimId, options) {
    return toView(ownerId, requireRow(ownerId, claimId, options));
  }

  function list(ownerId, {q = '', state = '', deleted = false} = {}) {
    const needle = cleanText(q, 200).toLowerCase();
    return repos.claims.listRows(ownerId, {deleted})
      .map(row => toView(ownerId, row, {withEvents: false}))
      .filter(claim => !state || claim.state === state)
      .filter(claim => !needle || [claim.title, claim.vendor, claim.orderRef, claim.issue].join(' ').toLowerCase().includes(needle));
  }

  // Loads the claim, checks its version (and that it is open unless allowed),
  // lets fn edit a copy of the payload, then saves and records history.
  // fn may return {state, deletedAt}.
  function mutate(ownerId, claimId, version, action, fn, {factsChanged = false, includeDeleted = false, allowClosed = false} = {}) {
    return transaction(db, () => {
      const row = requireRow(ownerId, claimId, {includeDeleted});
      expectVersion(row, version);
      if (!allowClosed) requireOpen(row);
      const payload = structuredClone(row.payload);
      const change = fn(payload, row) || {};
      repos.claims.update(ownerId, claimId, {payload, state: change.state, deletedAt: change.deletedAt, factsChanged, updatedAt: nowIso()});
      repos.audit.append(ownerId, claimId, action, {...row.payload, state: row.state}, {...payload, state: change.state ?? row.state});
      return detail(ownerId, claimId, {includeDeleted: true});
    });
  }

  function create(ownerId, input, key) {
    const data = parseClaimInput(input);
    const result = withIdempotency(ctx, ownerId, key, 'claim:create', input, () => {
      const id = newId();
      repos.claims.insert({id, ownerId, payload: {...data, replies: []}, state: 'preparing', createdAt: nowIso()});
      repos.audit.append(ownerId, id, '사건 등록', {}, data);
      return {id};
    });
    return detail(ownerId, result.id);
  }

  function update(ownerId, claimId, version, input) {
    const data = parseClaimInput(input);
    return mutate(ownerId, claimId, version, '사건 정보 수정', payload => {
      const ledger = repos.ledger.listForClaim(ownerId, claimId);
      const summary = totals(payload, ledger);
      forField(data.agreed === null ? 'claimedAmount' : 'agreedAmount', () =>
        reject(summary.cash > (data.agreed ?? data.claimed), '이미 받은 금액보다 낮게 합의액·청구액을 바꿀 수 없습니다.'));
      reject(summary.goods > requestedQuantity(data), '이미 받은 교환 수량보다 적게 바꿀 수 없습니다.');
      forField('kind', () => reject(ledger.length > 0 && payload.kind !== data.kind, '회수 기록이 있는 건은 처리 종류를 바꿀 수 없습니다.'));
      forField('currency', () => reject(ledger.length > 0 && payload.currency !== data.currency, '회수 기록이 있는 건은 통화를 바꿀 수 없습니다.'));
      Object.assign(payload, data);
    }, {factsChanged: true});
  }

  function transition(ownerId, claimId, version, input) {
    const reason = cleanText(input.reason, 2000);
    forField('reason', () => reject(reason.length < 3, '변경 사유를 3자 이상 남겨 주세요.'));
    return mutate(ownerId, claimId, version, `상태 변경 · ${cleanText(input.action, 20)}`, (payload, row) => {
      const summary = totals(payload, repos.ledger.listForClaim(ownerId, claimId));
      payload.lastReason = reason;
      return {state: nextStateForTransition(input.action, payload, row.state, summary)};
    }, {allowClosed: true});
  }

  function moveToTrash(ownerId, claimId, version, input = {}) {
    return mutate(ownerId, claimId, version, '휴지통으로 이동', payload => {
      payload.deleteReason = cleanText(input.reason, 500);
      return {deletedAt: nowIso()};
    }, {allowClosed: true});
  }

  function restore(ownerId, claimId, version) {
    return mutate(ownerId, claimId, version, '휴지통에서 복원', (_, row) => {
      reject(!row.deletedAt, '휴지통에 있는 건이 아닙니다.');
      return {deletedAt: null};
    }, {includeDeleted: true, allowClosed: true});
  }

  return {
    list, detail, create, update, transition, moveToTrash, restore,
    requireRow, expectVersion, requireOpen, mutate, toView,
  };
}
