import test from 'node:test';
import assert from 'node:assert/strict';
import {startApp, createClaim, editInput, current, cash, key} from '../helpers/app.mjs';

test('draft versions: changed facts make the draft stale; only the latest version can be marked sent', async t => {
  const {app, client} = await startApp(t);
  const user = await client().signup();
  let claim = await createClaim(user);

  const template = await user.call(`/api/claims/${claim.id}/draft-template`);
  assert.equal(template.data.origin, 'template');
  assert.match(template.data.body, /^Subject: Request for a refund/);
  let result = await user.call(`/api/claims/${claim.id}/drafts`, {method: 'POST', version: claim.version, key: key(), data: {body: 'too short'}});
  assert.equal(result.status, 422);
  result = await user.call(`/api/claims/${claim.id}/drafts`, {method: 'POST', version: claim.version, key: key(), data: {body: template.data.body, origin: 'template'}});
  assert.equal(result.status, 201);
  claim = result.data.claim;
  const firstDraft = claim.drafts[0];
  assert.equal(claim.state, 'review');
  assert.equal(firstDraft.origin, 'template');

  claim = (await user.call(`/api/claims/${claim.id}`, {method: 'PATCH', version: claim.version, data: editInput(claim, {issue: '사실을 바꿨습니다.'})})).data.claim;
  assert.equal(claim.drafts[0].stale, true);
  const submit = draftId => user.call(`/api/claims/${claim.id}/drafts/submit`, {method: 'POST', version: claim.version, key: key(), data: {draftId, confirmed: true, note: '판매처 문의 폼'}});
  assert.equal((await submit(firstDraft.id)).status, 422);

  claim = (await user.call(`/api/claims/${claim.id}/drafts`, {method: 'POST', version: claim.version, key: key(), data: {body: template.data.body + '\nUpdated facts.'}})).data.claim;
  assert.equal((await user.call(`/api/claims/${claim.id}/drafts/submit`, {method: 'POST', version: claim.version, key: key(), data: {draftId: claim.drafts[0].id, confirmed: false}})).status, 422);
  result = await submit(claim.drafts[0].id);
  assert.equal(result.status, 200);
  assert.equal(result.data.claim.state, 'awaiting');
  assert.equal(result.data.claim.drafts[0].submittedAt !== null, true);
  assert.equal(result.data.claim.events[0].after.sentByApp, false);
  assert.throws(() => app.db.prepare('UPDATE drafts SET body = ?').run('tampered'), /immutable draft/);
});

test('seller replies drive state only through the kind the user chose', async t => {
  const {client} = await startApp(t);
  const user = await client().signup();
  let claim = await createClaim(user);
  const reply = (kind, extra = {}) => user.call(`/api/claims/${claim.id}/replies`, {method: 'POST', version: claim.version, data: {body: 'We cannot accept this return.', kind, ...extra}});
  assert.equal((await reply('bogus')).status, 422);
  let result = await reply('denied', {translationKo: '반품을 받을 수 없습니다.', aiAssisted: true});
  assert.equal(result.status, 200);
  claim = result.data.claim;
  assert.equal(claim.state, 'disputed');
  assert.equal(claim.replies[0].translationKo, '반품을 받을 수 없습니다.');
  assert.equal(claim.replies[0].aiAssisted, true);
});

test('receipts: retries, cross-claim duplicates, concurrency and missing references', async t => {
  const {client} = await startApp(t);
  const user = await client().signup();
  let claim = await createClaim(user);
  const data = cash(claim, 'BANK-0001');
  const requestKey = key();
  const posted = await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', data, key: requestKey, version: claim.version});
  assert.equal(posted.status, 201);
  assert.equal(posted.data.claim.state, 'partial');
  const lostResponse = await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', data, key: requestKey, version: claim.version});
  assert.equal(lostResponse.data.receiptId, posted.data.receiptId);
  assert.equal(lostResponse.data.claim.ledger.length, 1);

  claim = await current(user, claim.id);
  let result = await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', data, key: key(), version: claim.version});
  assert.equal(result.data.error, 'duplicate_transaction');
  assert.equal(result.data.field, 'transactionRef');
  const other = await createClaim(user);
  result = await user.call(`/api/claims/${other.id}/receipts`, {method: 'POST', data: cash(other, 'BANK-0001'), key: key(), version: other.version});
  assert.equal(result.data.error, 'duplicate_transaction');

  const concurrent = await Promise.all([1, 2].map(() =>
    user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', data: cash(claim, 'BANK-SAME'), key: key(), version: claim.version})));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
  claim = await current(user, claim.id);
  assert.equal(claim.summary.cash, 4000);

  const manual = {...cash(claim), transactionRef: '', amount: '15.00', note: '식별자 없는 입금을 카드 명세서와 대조함'};
  assert.equal((await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', data: manual, key: key(), version: claim.version})).status, 422);
  const confirmed = {...manual, missingReferenceConfirmed: true, duplicateReviewed: true};
  result = await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', data: confirmed, key: key(), version: claim.version});
  assert.equal(result.status, 201);
  claim = result.data.claim;
  result = await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', data: confirmed, key: key(), version: claim.version});
  assert.equal(result.data.error, 'duplicate_suspected');
});

test('closing needs real recovery; reversals reopen the balance', async t => {
  const {client} = await startApp(t);
  const user = await client().signup();
  let claim = await createClaim(user);
  const close = () => user.call(`/api/claims/${claim.id}/transition`, {method: 'POST', version: claim.version, data: {action: 'close', reason: '전액 입금 확인'}});
  assert.equal((await close()).status, 422);

  claim = (await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', version: claim.version, key: key(), data: {...cash(claim), amount: '79.80'}})).data.claim;
  assert.equal(claim.state, 'recovered');
  claim = (await close()).data.claim;
  assert.equal(claim.state, 'completed');
  assert.equal((await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', version: claim.version, key: key(), data: cash(claim)})).status, 422);

  claim = (await user.call(`/api/claims/${claim.id}/transition`, {method: 'POST', version: claim.version, data: {action: 'reopen', reason: '카드사 취소 확인'}})).data.claim;
  const reversal = {kind: 'reversal', reverses: claim.ledger[0].id, receivedOn: '2026-10-10', proofId: claim.files[0].id, confirmed: true, note: '카드사 취소'};
  const result = await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', version: claim.version, key: key(), data: reversal});
  assert.equal(result.status, 201);
  assert.equal(result.data.claim.summary.cash, 0);
  assert.equal(result.data.claim.state, 'negotiating');
});
