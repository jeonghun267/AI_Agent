import test from 'node:test';
import assert from 'node:assert/strict';
import {startApp} from '../helpers/app.mjs';
import {DEMO_ACCOUNT} from '../../src/server/dev/seed.mjs';

test('development seed creates one demo account with a claim and its order PDF', async t => {
  const {client} = await startApp(t, {env: {APP_ENV: 'development', SEED_DEMO: '1'}});
  const demo = await client().login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
  const claims = (await demo.call('/api/claims')).data.claims;
  assert.equal(claims.length, 1);
  assert.equal(claims[0].currency, 'EUR');
  assert.equal(claims[0].files.length, 1);
});

test('the seed never runs outside development by default', async t => {
  const {client} = await startApp(t);
  const result = await client().call('/api/auth/login', {method: 'POST', data: {email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password}});
  assert.equal(result.status, 401);
});
