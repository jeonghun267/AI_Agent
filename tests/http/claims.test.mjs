import test from 'node:test';
import assert from 'node:assert/strict';
import {startApp, createClaim, claimInput, editInput, current, cash, key} from '../helpers/app.mjs';
import {fixtureOrderPdf} from '../../src/server/dev/fixtures.mjs';
import {sha256} from '../../src/server/domain/primitives.mjs';

test('users only ever see their own claims and files', async t => {
  const {client} = await startApp(t);
  const alice = await client().signup();
  const bob = await client().signup();
  const claim = await createClaim(alice);
  const fileId = claim.files[0].id;

  assert.equal((await bob.call('/api/claims')).data.claims.length, 0);
  assert.equal((await bob.call(`/api/claims/${claim.id}`)).status, 404);
  assert.equal((await bob.call(`/api/files/${fileId}`)).status, 404);
  assert.equal((await bob.call(`/api/claims/${claim.id}`, {method: 'PATCH', version: claim.version, data: editInput(claim)})).status, 404);
  assert.equal((await client().call(`/api/files/${fileId}`)).status, 401);

  const own = await alice.call(`/api/files/${fileId}`);
  assert.equal(own.status, 200);
  assert.equal(sha256(own.data), sha256(fixtureOrderPdf()));
  assert.match(own.headers.get('content-disposition'), /attachment/);

  const spoofed = await bob.call('/api/claims', {method: 'POST', key: key(), data: {...claimInput(), ownerId: 'someone-else', owner_id: 'x'}});
  assert.equal(spoofed.status, 201);
  assert.equal((await alice.call('/api/claims')).data.claims.length, 1);
});

test('idempotent create, optimistic locking and file retry/deduplication', async t => {
  const {client} = await startApp(t);
  const user = await client().signup();
  const requestKey = key();
  const input = claimInput();
  const first = await user.call('/api/claims', {method: 'POST', data: input, key: requestKey});
  const retry = await user.call('/api/claims', {method: 'POST', data: input, key: requestKey});
  assert.equal(retry.data.claim.id, first.data.claim.id);
  assert.equal((await user.call('/api/claims', {method: 'POST', data: {...input, title: '다른 요청'}, key: requestKey})).status, 409);
  assert.equal((await user.call('/api/claims', {method: 'POST', data: input})).status, 400);

  const claim = first.data.claim;
  const edits = await Promise.all(['A', 'B'].map(title =>
    user.call(`/api/claims/${claim.id}`, {method: 'PATCH', version: claim.version, data: editInput(claim, {title})})));
  assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]);

  const latest = await current(user, claim.id);
  const upload = {method: 'POST', raw: fixtureOrderPdf(), version: latest.version, key: key(), headers: {'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('주문서.pdf')}};
  const saved = await user.call(`/api/claims/${claim.id}/files`, upload);
  assert.equal(saved.status, 201);
  assert.equal(saved.data.claim.files[0].name, '주문서.pdf');
  const lostResponse = await user.call(`/api/claims/${claim.id}/files`, upload);
  assert.equal(lostResponse.data.fileId, saved.data.fileId);
  const sameBytes = await user.call(`/api/claims/${claim.id}/files`, {...upload, key: key(), version: saved.data.claim.version});
  assert.equal(sameBytes.data.fileId, saved.data.fileId);
  assert.equal(sameBytes.data.claim.files.length, 1);
  const fake = await user.call(`/api/claims/${claim.id}/files`, {...upload, key: key(), raw: Buffer.from('not a pdf')});
  assert.equal(fake.status, 422);
});

test('multi-currency amounts round-trip and invalid input is refused', async t => {
  const {client} = await startApp(t);
  const user = await client().signup();
  const yen = await user.call('/api/claims', {method: 'POST', key: key(), data: claimInput({
    currency: 'JPY', claimedAmount: '4500', agreedAmount: '', items: [{name: 'Cable', orderedQty: 1, claimQty: 1, unitPrice: '4500'}],
  })});
  assert.equal(yen.status, 201);
  assert.equal(yen.data.claim.claimed, 4500);
  for (const patch of [{currency: 'JPY', claimedAmount: '10.5'}, {currency: 'XYZ'}, {vendor: ''}, {claimedAmount: '1.001'}]) {
    assert.equal((await user.call('/api/claims', {method: 'POST', key: key(), data: claimInput(patch)})).status, 422, JSON.stringify(patch));
  }
});

test('trash hides claims and files until restored; proof files cannot be deleted', async t => {
  const {client} = await startApp(t);
  const user = await client().signup();
  let claim = await createClaim(user);
  const fileId = claim.files[0].id;

  let result = await user.call(`/api/claims/${claim.id}/receipts`, {method: 'POST', version: claim.version, key: key(), data: cash(claim)});
  assert.equal(result.status, 201);
  claim = result.data.claim;
  result = await user.call(`/api/claims/${claim.id}/files/${fileId}`, {method: 'DELETE', version: claim.version});
  assert.equal(result.status, 409);
  assert.equal(result.data.error, 'file_in_use');

  result = await user.call(`/api/claims/${claim.id}`, {method: 'DELETE', version: claim.version, data: {reason: '중복 등록'}});
  assert.equal(result.status, 200);
  assert.equal((await user.call(`/api/claims/${claim.id}`)).status, 404);
  assert.equal((await user.call(`/api/files/${fileId}`)).status, 404);
  const trash = (await user.call('/api/claims?deleted=1')).data.claims;
  assert.equal(trash.length, 1);

  result = await user.call(`/api/claims/${claim.id}/restore`, {method: 'POST', version: trash[0].version, data: {}});
  assert.equal(result.status, 200);
  assert.equal((await user.call(`/api/files/${fileId}`)).status, 200);
  assert.equal(result.data.claim.summary.cash, 2000, 'ledger survives the trash');
});

test('an unused evidence file can be removed and marks drafts stale', async t => {
  const {client} = await startApp(t);
  const user = await client().signup();
  let claim = await createClaim(user);
  const template = await user.call(`/api/claims/${claim.id}/draft-template`);
  claim = (await user.call(`/api/claims/${claim.id}/drafts`, {method: 'POST', version: claim.version, key: key(), data: {body: template.data.body, origin: 'template'}})).data.claim;
  assert.equal(claim.drafts[0].stale, false);
  const removed = await user.call(`/api/claims/${claim.id}/files/${claim.files[0].id}`, {method: 'DELETE', version: claim.version});
  assert.equal(removed.status, 200);
  assert.equal(removed.data.claim.files.length, 0);
  assert.equal(removed.data.claim.drafts[0].stale, true);
});
