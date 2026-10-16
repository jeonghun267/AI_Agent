import test from 'node:test';
import assert from 'node:assert/strict';
import {startApp, createClaim, key} from '../helpers/app.mjs';
import {createFakeProvider} from '../../src/server/ai/fake.provider.mjs';
import {createDisabledProvider} from '../../src/server/ai/disabled.provider.mjs';

async function consentedUser(client) {
  const user = await client().signup();
  const consent = await user.call('/api/account/ai-consent', {method: 'POST', data: {consent: true}});
  assert.equal(consent.status, 200);
  return user;
}

test('without a key the AI is reported disabled and every AI route answers 503', async t => {
  const {client} = await startApp(t, {aiProvider: createDisabledProvider()});
  assert.equal((await client().call('/api/config')).data.ai.enabled, false);
  const user = await consentedUser(client);
  const claim = await createClaim(user);
  const result = await user.call(`/api/claims/${claim.id}/ai/draft`, {method: 'POST', data: {}});
  assert.equal(result.status, 503);
  assert.equal(result.data.error, 'ai_disabled');
  assert.equal((await user.call(`/api/claims/${claim.id}/draft-template`)).status, 200, 'the rule-based draft still works');
});

test('AI needs explicit consent, which can be withdrawn', async t => {
  const {client, aiProvider} = await startApp(t);
  const user = await client().signup();
  const claim = await createClaim(user);
  const draft = () => user.call(`/api/claims/${claim.id}/ai/draft`, {method: 'POST', data: {}});
  assert.equal((await draft()).data.error, 'ai_consent_required');
  assert.equal(aiProvider.calls.length, 0, 'nothing is sent before consent');

  await user.call('/api/account/ai-consent', {method: 'POST', data: {consent: true}});
  assert.equal((await user.call('/api/me')).data.ai.consented, true);
  assert.equal((await draft()).status, 200);
  await user.call('/api/account/ai-consent', {method: 'POST', data: {consent: false}});
  assert.equal((await draft()).data.error, 'ai_consent_required');
});

test('draft, translation, reply analysis and extraction return previews without saving', async t => {
  const {client, aiProvider} = await startApp(t);
  const user = await consentedUser(client);
  const claim = await createClaim(user);

  const draft = await user.call(`/api/claims/${claim.id}/ai/draft`, {method: 'POST', data: {}});
  assert.equal(draft.status, 200);
  assert.match(draft.data.body, /^Subject: /);
  assert.equal(draft.data.origin, 'ai');
  assert.deepEqual(draft.data.missingInfo, ['보내는 사람 이름']);
  const sent = aiProvider.calls.at(-1);
  assert.match(sent.parts[0].text, /<claim_facts>/);
  assert.match(sent.parts[0].text, /Example Gadgets EU/);

  const translated = await user.call('/api/ai/translate-issue', {method: 'POST', data: {text: '두 개 중 한 개가 켜지지 않아요.'}});
  assert.equal(translated.data.english, 'One of the two units does not power on.');
  assert.equal((await user.call('/api/ai/translate-issue', {method: 'POST', data: {text: ''}})).status, 422);

  const analysis = await user.call(`/api/claims/${claim.id}/ai/analyze-reply`, {method: 'POST', data: {body: 'Please send photos of the defect.'}});
  assert.equal(analysis.data.suggestedKind, 'evidence');

  const extraction = await user.call(`/api/claims/${claim.id}/ai/extract`, {method: 'POST', data: {fileId: claim.files[0].id}});
  assert.equal(extraction.status, 200);
  assert.equal(extraction.data.suggestion.currency, 'EUR');
  assert.equal(extraction.data.orderTotal, '79.80');
  assert.equal(extraction.data.suggestion.claimedAmount, undefined, 'the order total never fills the claim amount');
  assert.equal(extraction.data.suggestion.items[0].orderedQty, 2);
  assert.equal(aiProvider.calls.at(-1).parts[0].file.mime, 'application/pdf');

  const after = (await user.call(`/api/claims/${claim.id}`)).data.claim;
  assert.equal(after.version, claim.version, 'AI calls never change the claim');
  assert.equal(after.drafts.length, 0);

  const other = await createClaim(user);
  assert.equal((await user.call(`/api/claims/${other.id}/ai/extract`, {method: 'POST', data: {fileId: claim.files[0].id}})).status, 404);
  const stranger = await consentedUser(client);
  assert.equal((await stranger.call(`/api/claims/${claim.id}/ai/draft`, {method: 'POST', data: {}})).status, 404);
});

test('malformed model output is rejected and every call counts toward the hourly limit', async t => {
  const aiProvider = createFakeProvider({draft: () => ({subject: '', body: 42})});
  const {app, client} = await startApp(t, {aiProvider, env: {AI_HOURLY_LIMIT: '2'}});
  const user = await consentedUser(client);
  const claim = await createClaim(user);
  const draft = () => user.call(`/api/claims/${claim.id}/ai/draft`, {method: 'POST', data: {}});
  const first = await draft();
  assert.equal(first.status, 502);
  assert.equal(first.data.error, 'ai_bad_output');
  assert.equal((await user.call(`/api/claims/${claim.id}/ai/analyze-reply`, {method: 'POST', data: {body: 'ok'}})).status, 200);
  const limited = await draft();
  assert.equal(limited.status, 429);
  assert.equal(limited.data.error, 'ai_rate_limited');
  const usage = app.db.prepare('SELECT capability, ok, error_code FROM ai_usage ORDER BY rowid').all();
  assert.deepEqual(usage.map(row => [row.capability, row.ok, row.error_code]), [['draft', 0, 'ai_bad_output'], ['analyze-reply', 1, '']]);
});

test('reply analysis output is sanitized before it reaches the client', async t => {
  const aiProvider = createFakeProvider({'analyze-reply': () => ({
    translationKo: '환불했습니다.', summaryKo: '환불 처리 통지예요.', suggestedKind: 'made-up',
    mentionedAmount: '$12', mentionedCurrency: 'DOGE', deadline: 'next week', deadlineQuote: 'soon',
  })});
  const {client} = await startApp(t, {aiProvider});
  const user = await consentedUser(client);
  const claim = await createClaim(user);
  const result = await user.call(`/api/claims/${claim.id}/ai/analyze-reply`, {method: 'POST', data: {body: 'Refunded.'}, key: key()});
  assert.deepEqual(
    [result.data.suggestedKind, result.data.mentionedAmount, result.data.mentionedCurrency, result.data.deadline, result.data.deadlineQuote],
    ['other', null, null, null, null],
  );
});
