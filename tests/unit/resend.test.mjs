import test from 'node:test';
import assert from 'node:assert/strict';
import {createResendProvider} from '../../src/server/mail/resend.provider.mjs';
import {createMailProvider} from '../../src/server/mail/provider.mjs';
import {loadConfig} from '../../src/server/config.mjs';
import {AppError} from '../../src/server/domain/errors.mjs';

const KEY = 're_test_key_should_never_leak';
const message = {to: 'user@example.test', subject: '[ReLo] 비밀번호 재설정 링크', text: 'link: http://127.0.0.1/#/reset/abc'};
const reply = (status, body = {}) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

function provider(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url, init, body: JSON.parse(init.body)});
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return {calls, resend: createResendProvider({apiKey: KEY, from: 'ReLo <no-reply@relo.example>', timeoutMs: 1000}, {fetchImpl, retryDelayMs: 1})};
}

async function failsWith(promise, code, detail = '') {
  await assert.rejects(promise, error => error instanceof AppError && error.code === code
    && error.detail === detail && !error.message.includes(KEY) && !detail.includes(KEY));
}

test('resend: posts one plain-text message with the key, a User-Agent and an idempotency key', async () => {
  const {calls, resend} = provider([reply(200, {id: 'email-1'})]);
  await resend.send(message);
  const [{url, init, body}] = calls;
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
  assert.ok(init.headers['User-Agent'], 'Resend rejects requests without a User-Agent');
  assert.match(init.headers['Idempotency-Key'], /^[\w-]{1,256}$/);
  assert.deepEqual(body, {from: 'ReLo <no-reply@relo.example>', to: ['user@example.test'], subject: message.subject, text: message.text});
  assert.equal(init.body.includes(KEY), false, 'the key is only in the header');
});

test('resend: retries once on 5xx, 429 and network errors with the same idempotency key', async () => {
  const flaky = provider([reply(500), reply(200, {id: 'email-2'})]);
  await flaky.resend.send(message);
  assert.equal(flaky.calls.length, 2);
  assert.equal(flaky.calls[0].init.headers['Idempotency-Key'], flaky.calls[1].init.headers['Idempotency-Key'], 'a retry cannot send twice');

  const offline = provider([new TypeError('fetch failed'), new TypeError('fetch failed')]);
  await failsWith(offline.resend.send(message), 'mail_unreachable');
  assert.equal(offline.calls.length, 2);

  await failsWith(provider([reply(429), reply(429, {name: 'rate_limit_exceeded'})]).resend.send(message), 'mail_busy', 'rate_limit_exceeded');
  await failsWith(provider([reply(503), reply(502)]).resend.send(message), 'mail_unreachable');
});

test('resend: key and sender problems are configuration errors; other refusals are not retried', async () => {
  for (const status of [401, 403]) {
    const {calls, resend} = provider([reply(status, {name: 'validation_error', message: `bad key ${KEY}`})]);
    await failsWith(resend.send(message), 'mail_config', 'validation_error');
    assert.equal(calls.length, 1);
  }
  await failsWith(provider([reply(422, {name: 'invalid_parameter'})]).resend.send(message), 'mail_rejected', 'invalid_parameter');
});

test('mail settings: a Resend key selects Resend; production needs a verified sender', () => {
  const production = {APP_ENV: 'production', APP_ORIGIN: 'https://relo.example'};
  assert.throws(() => loadConfig({...production, RESEND_API_KEY: KEY}), /MAIL_FROM is required/);
  const live = loadConfig({...production, RESEND_API_KEY: KEY, MAIL_FROM: 'ReLo <no-reply@relo.example>'}).mail;
  assert.deepEqual([live.provider, live.from], ['resend', 'ReLo <no-reply@relo.example>']);
  assert.equal(createMailProvider(live).name, 'resend');

  const development = loadConfig({APP_ENV: 'development', RESEND_API_KEY: KEY}).mail;
  assert.deepEqual([development.provider, development.from], ['resend', 'ReLo <onboarding@resend.dev>']);
  assert.equal(loadConfig({APP_ENV: 'development'}).mail.provider, 'console');
  assert.equal(loadConfig({APP_ENV: 'development', RESEND_API_KEY: KEY, MAIL_PROVIDER: 'console'}).mail.provider, 'console');
  assert.throws(() => loadConfig({MAIL_PROVIDER: 'resend'}), /needs RESEND_API_KEY/);
  assert.throws(() => loadConfig({MAIL_PROVIDER: 'smtp'}), /MAIL_PROVIDER must be one of/);
});
