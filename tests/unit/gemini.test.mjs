import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiProvider} from '../../src/server/ai/gemini.provider.mjs';
import {AppError} from '../../src/server/domain/errors.mjs';

const KEY = 'test-key-should-never-leak';
const request = {capability: 'extract', system: 'sys', parts: [{file: {mime: 'application/pdf', bytes: Buffer.from('%PDF-')}}, {text: 'go'}], schema: {type: 'OBJECT'}};

const reply = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const ok = (text, extra = {}) => reply(200, {
  candidates: [{content: {parts: [{text: 'thinking...', thought: true}, {text}]}, finishReason: 'STOP', ...extra}],
  usageMetadata: {promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5},
});

function provider(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url, init, body: JSON.parse(init.body)});
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return {calls, gemini: createGeminiProvider({apiKey: KEY, model: 'gemini-test', timeoutMs: 1000}, {fetchImpl})};
}

async function failsWith(promise, code) {
  await assert.rejects(promise, error => error instanceof AppError && error.code === code && !error.message.includes(KEY));
}

test('builds a generateContent request and reads JSON text and usage', async () => {
  const {calls, gemini} = provider([ok('{"orderRef":"A-1"}')]);
  const result = await gemini.generateJson(request);
  assert.deepEqual(result.data, {orderRef: 'A-1'});
  assert.deepEqual(result.usage, {inputTokens: 100, outputTokens: 25});
  const [{url, init, body}] = calls;
  assert.match(url, /\/models\/gemini-test:generateContent$/);
  assert.equal(init.headers['x-goog-api-key'], KEY);
  assert.equal(url.includes(KEY), false, 'the key is sent as a header, not in the URL');
  assert.deepEqual(body.contents[0].parts[0], {inline_data: {mime_type: 'application/pdf', data: Buffer.from('%PDF-').toString('base64')}});
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema, {type: 'OBJECT'});
  assert.equal(body.systemInstruction.parts[0].text, 'sys');
});

test('retries once on 5xx, 429 and network errors, then gives up', async () => {
  let {calls, gemini} = provider([reply(503, {}), ok('{}')]);
  await gemini.generateJson(request);
  assert.equal(calls.length, 2);
  ({calls, gemini} = provider([reply(429, {}), reply(429, {})]));
  await failsWith(gemini.generateJson(request), 'ai_busy');
  ({calls, gemini} = provider([new TypeError('fetch failed'), reply(500, {})]));
  await failsWith(gemini.generateJson(request), 'ai_unreachable');
  assert.equal(calls.length, 2);
});

test('maps configuration, safety and malformed responses to clear errors', async () => {
  await failsWith(provider([reply(403, {error: {message: `bad key ${KEY}`}})]).gemini.generateJson(request), 'ai_config');
  await failsWith(provider([reply(400, {})]).gemini.generateJson(request), 'ai_request_rejected');
  await failsWith(provider([reply(200, {promptFeedback: {blockReason: 'SAFETY'}})]).gemini.generateJson(request), 'ai_blocked');
  await failsWith(provider([ok('{}', {finishReason: 'SAFETY'})]).gemini.generateJson(request), 'ai_blocked');
  await failsWith(provider([ok('{"cut', {finishReason: 'MAX_TOKENS'})]).gemini.generateJson(request), 'ai_bad_output');
  await failsWith(provider([ok('not json')]).gemini.generateJson(request), 'ai_bad_output');
  const timeout = Object.assign(new Error('timed out'), {name: 'TimeoutError'});
  await failsWith(provider([timeout]).gemini.generateJson(request), 'ai_timeout');
});
