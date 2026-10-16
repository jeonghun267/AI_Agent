import test from 'node:test';
import assert from 'node:assert/strict';
import {startApp, createClaim, PASSWORD} from '../helpers/app.mjs';
import {fixtureOrderPdf} from '../../src/server/dev/fixtures.mjs';

test('data export contains every claim and file the user owns', async t => {
  const {client} = await startApp(t);
  const user = await client().signup();
  const claim = await createClaim(user);
  const exported = await user.call('/api/account/export');
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-disposition'), /relo-export-/);
  assert.equal(exported.data.format, 'relo-export-v1');
  assert.equal(exported.data.claims[0].id, claim.id);
  assert.equal(Buffer.from(exported.data.files[0].base64, 'base64').equals(fixtureOrderPdf()), true);
  assert.equal(JSON.stringify(exported.data).includes('password'), false);
});

test('account deletion needs the password and removes only that user', async t => {
  const {app, client} = await startApp(t);
  const leaving = await client().signup();
  const staying = await client().signup();
  await createClaim(leaving);
  const kept = await createClaim(staying);

  const wrong = await leaving.call('/api/account/delete', {method: 'POST', data: {password: 'not-my-password'}});
  assert.equal(wrong.status, 403);
  assert.equal((await leaving.call('/api/me')).status, 200, 'a wrong password does not sign the user out');

  assert.equal((await leaving.call('/api/account/delete', {method: 'POST', data: {password: PASSWORD}})).status, 200);
  assert.equal((await leaving.call('/api/me')).status, 401);
  assert.equal((await client().call('/api/auth/login', {method: 'POST', data: {email: leaving.email, password: PASSWORD}})).status, 401);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM claims').get().n, 1);
  assert.equal((await staying.call(`/api/claims/${kept.id}`)).status, 200);
});
