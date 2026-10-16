import {reject, AppError, forField} from '../domain/errors.mjs';
import {newId, nowIso} from '../domain/primitives.mjs';
import {totals, stateAfterReceipt} from '../domain/claim.mjs';
import {parseReceipt} from '../domain/receipt.mjs';
import {withIdempotency} from './idempotency.mjs';

// Records money/goods/repair the user actually received (never a promise or
// notice). Each entry points at an evidence file; mistakes are fixed with a
// reversal entry, never by editing.
export function createReceiptService(ctx) {
  const {repos, claims} = ctx;

  function record(ownerId, claimId, version, input, key) {
    const result = withIdempotency(ctx, ownerId, key, `receipt:${claimId}`, {version, ...input}, () => {
      const row = claims.requireRow(ownerId, claimId);
      claims.expectVersion(row, version);
      claims.requireOpen(row);
      const proof = repos.files.findWithBytes(ownerId, input.proofId);
      if (!proof || proof.claimId !== claimId) throw new AppError(404, 'not_found', '이 건의 증빙 파일을 선택하세요.', 'proofId');

      const ledger = repos.ledger.listForClaim(ownerId, claimId);
      const summary = totals(row.payload, ledger);
      const entry = parseReceipt(row.payload, summary, ledger, input);
      if (entry.kind === 'cash' && entry.transactionRef) {
        forField('transactionRef', () => reject(repos.ledger.findCashByRef(ownerId, entry.transactionRef),
          '이미 기록한 거래예요. 같은 입금을 두 번 셀 수 없어요.', 'duplicate_transaction', 409));
      }

      const receiptId = newId();
      const at = nowIso();
      repos.ledger.insert({id: receiptId, ownerId, claimId, ...entry, proofId: proof.id, createdAt: at});
      const after = totals(row.payload, [...ledger, {id: receiptId, ...entry}]);
      repos.claims.update(ownerId, claimId, {state: stateAfterReceipt(row.state, row.payload, after), factsChanged: true, updatedAt: at});
      repos.audit.append(ownerId, claimId, entry.kind === 'reversal' ? '회수 기록 정정' : '실제 회수 확인', summary,
        {...after, receiptId, kind: entry.kind, proofId: proof.id, receivedOn: entry.receivedOn, note: entry.note, transactionRef: entry.transactionRef});
      return {receiptId};
    });
    return {claim: claims.detail(ownerId, claimId), receiptId: result.receiptId, duplicate: !!result.duplicate};
  }

  return {record};
}
