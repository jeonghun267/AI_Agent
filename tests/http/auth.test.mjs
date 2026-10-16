import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {startApp, claimInput, key, PASSWORD} from '../helpers/app.mjs';

test('signup, login, logout and session-protected endpoints', async t => {
  const {client} = await startApp(t);
  const anon = client();
  assert.equal((await anon.call('/api/me')).status, 401);
  assert.equal((await anon.call('/api/config')).status, 200);
  assert.equal((await anon.call('/api/health')).data.ok, true);

  const user = await client().signup('Mixed.Case@Example.test');
  const me = await user.call('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'mixed.case@example.test');
  assert.equal(me.data.ai.consented, false);

  const taken = await client().call('/api/auth/signup', {method: 'POST', data: {email: 'mixed.case@example.test', password: PASSWORD}});
  assert.deepEqual([taken.status, taken.data.field], [409, 'email']);
  const short = await client().call('/api/auth/signup', {method: 'POST', data: {email: 'short@example.test', password: 'short'}});
  assert.deepEqual([short.status, short.data.field], [422, 'password']);
  assert.equal((await client().call('/api/auth/login', {method: 'POST', data: {email: 'mixed.case@example.test', password: 'wrong-password'}})).status, 401);

  const second = await client().login('mixed.case@example.test');
  assert.equal((await second.call('/api/me')).status, 200);
  assert.equal((await user.call('/api/auth/logout', {method: 'POST', data: {}})).status, 200);
  assert.equal((await user.call('/api/me')).status, 401);
  assert.equal((await second.call('/api/me')).status, 200, 'other devices stay signed in');
});

test('CSRF, Origin and Host checks reject forged requests', async t => {
  const {base, client} = await startApp(t);
  const user = await client().signup();
  const create = headers => user.call('/api/claims', {method: 'POST', data: claimInput(), key: key(), headers});
  assert.equal((await create({Origin: 'https://evil.example'})).status, 403);
  assert.equal((await create({'X-CSRF-Token': 'wrong'})).status, 403);
  assert.equal((await create({'X-CSRF-Token': 'é'.repeat(32)})).status, 403);
  assert.equal((await create({})).status, 201);

  const hostStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(base + '/api/health', {headers: {Host: 'evil.example'}}, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(hostStatus, 403);
  for (const path of ['/../.relo-data/relo.sqlite', '/src/server/config.mjs', '/.env', '/api/nope']) {
    assert.equal((await client().call(path)).status, 404, path);
  }
});

test('login attempts are rate limited and sessions expire', async t => {
  const {client} = await startApp(t, {env: {SESSION_TTL_SECONDS: '1'}});
  const user = await client().signup();
  const attempts = await Promise.all(Array.from({length: 9}, () =>
    client().call('/api/auth/login', {method: 'POST', data: {email: user.email, password: 'wrong-password'}})));
  assert.deepEqual(attempts.map(r => r.status).sort(), [401, 401, 401, 401, 401, 401, 401, 401, 429]);

  await delay(1200);
  assert.equal((await user.call('/api/me')).status, 401);
});
