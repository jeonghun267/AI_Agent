import {transaction} from '../repositories/db.mjs';
import {reject} from '../domain/errors.mjs';
import {nowIso, sha256} from '../domain/primitives.mjs';

// Runs fn at most once per (owner, Idempotency-Key). A retry after a lost
// response returns the first result with duplicate: true instead of acting twice.
export function withIdempotency({db, repos}, ownerId, key, action, input, fn) {
  reject(!/^[a-zA-Z0-9-]{8,128}$/.test(key || ''), '재시도 확인 키가 필요합니다.', 'idempotency_required', 400);
  return transaction(db, () => {
    const inputHash = sha256(JSON.stringify(input));
    const prior = repos.idempotency.find(ownerId, key);
    if (prior) {
      reject(prior.action !== action || prior.inputHash !== inputHash, '같은 재시도 키로 다른 요청을 보낼 수 없습니다.', 'idempotency_conflict', 409);
      return {...prior.result, duplicate: true};
    }
    const result = fn();
    repos.idempotency.insert({ownerId, key, action, inputHash, result, createdAt: nowIso()});
    return result;
  });
}
