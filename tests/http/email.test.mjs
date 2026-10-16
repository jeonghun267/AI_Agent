import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {startApp, PASSWORD} from '../helpers/app.mjs';
import {loadConfig} from '../../src/server/config.mjs';

const NEW_PASSWORD = 'Brand-New-Pass-2026';
const post = (client, path, data) => client.call(path, {method: 'POST', data});

test('signing up sends a verification link that works once, from any browser', async t => {
  const {client, mail} = await startApp(t);
  const config = (await client().call('/api/config')).data;
  assert.deepEqual(config.mail, {enabled: true, verifyLinkHours: 24, resetLinkMinutes: 30});

  const user = await client().signup('verify@example.test');
  assert.equal((await user.call('/api/me')).data.user.emailVerifiedAt, null);
  assert.equal(mail.count(user.email, 'verify'), 1);
  assert.match(mail.messages[0].subject, /인증/);

  const token = mail.token(user.email, 'verify');
  const elsewhere = client();
  assert.equal((await post(elsewhere, '/api/auth/verify', {token})).status, 200);
  assert.ok((await user.call('/api/me')).data.user.emailVerifiedAt);

  const reused = await post(elsewhere, '/api/auth/verify', {token});
  assert.equal(reused.status, 400);
  assert.equal(reused.data.error, 'invalid_link');
  for (const bad of ['', 'x'.repeat(500), 42, null]) {
    assert.equal((await post(elsewhere, '/api/auth/verify', {token: bad})).status, 400, String(bad));
  }

  assert.deepEqual((await post(user, '/api/auth/verify/resend', {})).data, {sent: false}, 'nothing to resend once verified');
  assert.equal(mail.count(user.email, 'verify'), 1);
  assert.equal((await post(client(), '/api/auth/verify/resend', {})).status, 401);
});

test('verification links expire, only the newest works, and resending is limited', async t => {
  const {client, mail} = await startApp(t, {env: {EMAIL_VERIFY_TTL_SECONDS: '1'}});
  const user = await client().signup('expire@example.test');
  const first = mail.token(user.email, 'verify');
  assert.deepEqual((await post(user, '/api/auth/verify/resend', {})).data, {sent: true});
  const second = mail.token(user.email, 'verify');
  assert.notEqual(first, second);
  assert.equal((await post(user, '/api/auth/verify', {token: first})).status, 400, 'a newer link replaces the older one');

  await delay(1200);
  assert.equal((await post(user, '/api/auth/verify', {token: second})).status, 400, 'expired');
  assert.equal((await user.call('/api/me')).data.user.emailVerifiedAt, null);

  const resends = [];
  for (let i = 0; i < 3; i += 1) resends.push((await post(user, '/api/auth/verify/resend', {})).status);
  assert.deepEqual(resends, [200, 200, 429], 'three resends per hour');
  assert.equal((await post(user, '/api/auth/verify', {token: mail.token(user.email, 'verify')})).status, 200);
});

test('forgot password answers the same whether or not the address has an account', async t => {
  const {client, mail} = await startApp(t);
  await client().signup('known@example.test');
  const anon = client();

  const known = await post(anon, '/api/auth/forgot', {email: 'Known@Example.test'});
  const unknown = await post(anon, '/api/auth/forgot', {email: 'nobody@example.test'});
  assert.equal(known.status, 200);
  assert.deepEqual([unknown.status, unknown.data], [known.status, known.data]);
  assert.equal(mail.count('known@example.test', 'reset'), 1);
  assert.equal(mail.messages.some(message => message.to === 'nobody@example.test'), false);
  assert.equal((await post(anon, '/api/auth/forgot', {email: 'not-an-email'})).status, 422);

  // Limits count requests, not accounts, so a 429 reveals nothing either.
  const statuses = async email => {
    const result = [];
    for (let i = 0; i < 3; i += 1) result.push((await post(anon, '/api/auth/forgot', {email})).status);
    return result;
  };
  assert.deepEqual(await statuses('known@example.test'), [200, 200, 429], 'three per address per hour');
  assert.deepEqual(await statuses('nobody@example.test'), [200, 200, 429]);
  assert.equal(mail.count('known@example.test', 'reset'), 3);
  assert.equal((await post(anon, '/api/auth/forgot', {email: 'third@example.test'})).status, 200);
  assert.equal((await post(anon, '/api/auth/forgot', {email: 'fourth@example.test'})).status, 429, 'ten per client per hour');
});

test('a reset link sets a new password once and signs out every session', async t => {
  const {client, mail} = await startApp(t);
  const phone = await client().signup('reset@example.test');
  const laptop = await client().login('reset@example.test');
  const anon = client();
  assert.equal((await post(anon, '/api/auth/forgot', {email: 'reset@example.test'})).status, 200);
  const token = mail.token('reset@example.test', 'reset');
  assert.ok(token);

  assert.equal((await post(anon, '/api/auth/verify', {token})).status, 400, 'a reset link cannot verify');
  assert.equal((await post(anon, '/api/auth/reset', {token, password: 'short'})).status, 422);
  assert.equal((await post(anon, '/api/auth/reset', {token, password: NEW_PASSWORD})).status, 200, 'neither mistake used the link up');

  assert.equal((await phone.call('/api/me')).status, 401);
  assert.equal((await laptop.call('/api/me')).status, 401);
  assert.equal((await post(client(), '/api/auth/login', {email: 'reset@example.test', password: PASSWORD})).status, 401);
  const fresh = await client().login('reset@example.test', NEW_PASSWORD);
  assert.ok((await fresh.call('/api/me')).data.user.emailVerifiedAt, 'the reset link proves the mailbox');

  const reused = await post(anon, '/api/auth/reset', {token, password: 'Another-Pass-2026'});
  assert.equal(reused.status, 400);
  assert.equal(reused.data.error, 'invalid_link');
  await client().login('reset@example.test', NEW_PASSWORD);

  // The unused sign-up verification link goes away with the account.
  assert.equal((await post(fresh, '/api/account/delete', {password: NEW_PASSWORD})).status, 200);
});

test('reset links expire and a newer request replaces the older link', async t => {
  const {client, mail} = await startApp(t, {env: {PASSWORD_RESET_TTL_SECONDS: '1'}});
  await client().signup('late@example.test');
  const anon = client();
  await post(anon, '/api/auth/forgot', {email: 'late@example.test'});
  const first = mail.token('late@example.test', 'reset');
  await post(anon, '/api/auth/forgot', {email: 'late@example.test'});
  const second = mail.token('late@example.test', 'reset');
  assert.notEqual(first, second);
  assert.equal((await post(anon, '/api/auth/reset', {token: first, password: NEW_PASSWORD})).status, 400, 'replaced');

  await delay(1200);
  assert.equal((await post(anon, '/api/auth/reset', {token: second, password: NEW_PASSWORD})).status, 400, 'expired');
  await client().login('late@example.test', PASSWORD);
});

test('without a mail service the links are switched off, and console mail stays out of production', async t => {
  const production = {APP_ENV: 'production', APP_ORIGIN: 'https://relo.example'};
  assert.equal(loadConfig(production).mail.provider, 'disabled');
  assert.throws(() => loadConfig({...production, MAIL_PROVIDER: 'console'}), /MAIL_PROVIDER=console/);
  assert.equal(loadConfig({APP_ENV: 'development'}).mail.provider, 'console');

  const {client} = await startApp(t, {env: {MAIL_PROVIDER: 'disabled'}, mail: null});
  const anon = client();
  assert.equal((await anon.call('/api/config')).data.mail.enabled, false);
  const user = await client().signup();
  assert.equal((await post(user, '/api/auth/verify/resend', {})).status, 503);
  assert.equal((await post(anon, '/api/auth/forgot', {email: user.email})).status, 503);
});
