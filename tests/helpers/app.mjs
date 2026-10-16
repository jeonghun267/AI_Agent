import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '../../src/server/config.mjs';
import {createApp} from '../../src/server/app.mjs';
import {createFakeProvider} from '../../src/server/ai/fake.provider.mjs';
import {fixtureOrderPdf} from '../../src/server/dev/fixtures.mjs';

export const PASSWORD = 'Correct-Horse-2026';
export const key = () => randomUUID();
const silent = {error() {}, log() {}};

// A mail provider that keeps every message, so tests can follow the one-time links.
export function createOutbox() {
  const messages = [];
  return {
    name: 'outbox',
    enabled: true,
    messages,
    async send(message) { messages.push(message); },
    // Token from the newest verify|reset link sent to this address, or null.
    token(to, kind) {
      const message = messages.findLast(m => m.to === to && m.text.includes(`/#/${kind}/`));
      return message?.text.match(new RegExp(`/#/${kind}/([\\w-]+)`))[1] ?? null;
    },
    count: (to, kind) => messages.filter(m => m.to === to && m.text.includes(`/#/${kind}/`)).length,
  };
}

// Starts the real app on a random loopback port with a throwaway database.
export async function startApp(t, {env = {}, aiProvider = createFakeProvider(), mail = createOutbox()} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'relo-http-'));
  const config = loadConfig({APP_ENV: 'test', PORT: '0', DATA_DIR: dir, AI_PROVIDER: 'fake', ...env});
  const app = createApp(config, {aiProvider, mailProvider: mail, logger: silent});
  const base = await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close();
    // Windows can hold a just-closed SQLite file for a moment (e.g. antivirus); retry the delete.
    await rm(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  });
  return {app, base, aiProvider, mail, client: () => createClient(base)};
}

// A browser-like client: keeps the session cookie and CSRF token, sends Origin.
export function createClient(base) {
  let cookie = '';
  let csrf = '';
  return {
    get csrf() { return csrf; },
    async call(path, {method = 'GET', data, raw, version, key: requestKey, headers = {}} = {}) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Origin: base,
          ...(cookie ? {Cookie: cookie} : {}),
          ...(method === 'GET' ? {} : {'X-CSRF-Token': csrf}),
          ...(data === undefined ? {} : {'Content-Type': 'application/json'}),
          ...(version === undefined ? {} : {'If-Match': String(version)}),
          ...(requestKey ? {'Idempotency-Key': requestKey} : {}),
          ...headers,
        },
        body: raw ?? (data === undefined ? undefined : JSON.stringify(data)),
      });
      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      const payload = isJson ? await response.json() : Buffer.from(await response.arrayBuffer());
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
      if (isJson && payload?.csrf) csrf = payload.csrf;
      return {status: response.status, data: payload, headers: response.headers};
    },
    async signup(email = `user-${randomUUID().slice(0, 8)}@example.test`, password = PASSWORD) {
      const result = await this.call('/api/auth/signup', {method: 'POST', data: {email, password, name: '테스트'}});
      assert.equal(result.status, 201, JSON.stringify(result.data));
      this.email = email;
      return this;
    },
    async login(email = this.email, password = PASSWORD) {
      const result = await this.call('/api/auth/login', {method: 'POST', data: {email, password}});
      assert.equal(result.status, 200, JSON.stringify(result.data));
      return this;
    },
  };
}

export const claimInput = (patch = {}) => ({
  title: 'USB-C 허브',
  vendor: 'Example Gadgets EU',
  orderRef: `EG-${randomUUID().slice(0, 8)}`,
  orderedOn: '2026-10-01',
  kind: 'refund',
  currency: 'EUR',
  claimedAmount: '79.80',
  agreedAmount: '79.80',
  issue: '두 개 모두 전원이 들어오지 않습니다.',
  items: [{name: 'USB-C Hub', orderedQty: 2, claimQty: 2, unitPrice: '39.90'}],
  ...patch,
});

// Converts a claim view back into editable input (amounts as decimals).
export function editInput(claim, patch = {}) {
  const digits = {JPY: 0, KRW: 0}[claim.currency] ?? 2;
  const decimal = minor => minor === null ? '' : (minor / 10 ** digits).toFixed(digits);
  return {
    ...claim,
    claimedAmount: decimal(claim.claimed),
    agreedAmount: decimal(claim.agreed),
    items: claim.items.map(item => ({...item, unitPrice: decimal(item.unitPrice)})),
    ...patch,
  };
}

export async function createClaim(client, patch = {}) {
  const created = await client.call('/api/claims', {method: 'POST', data: claimInput(patch), key: key()});
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const claim = created.data.claim;
  const uploaded = await client.call(`/api/claims/${claim.id}/files`, {
    method: 'POST', raw: fixtureOrderPdf(), version: claim.version, key: key(),
    headers: {'Content-Type': 'application/pdf', 'X-File-Name': 'order.pdf'},
  });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  return uploaded.data.claim;
}

export async function current(client, claimId) {
  const result = await client.call(`/api/claims/${claimId}`);
  assert.equal(result.status, 200);
  return result.data.claim;
}

export const cash = (claim, transactionRef = `BANK-${randomUUID().slice(0, 8)}`) => ({
  kind: 'cash', amount: '20.00', receivedOn: '2026-10-09', proofId: claim.files[0].id,
  transactionRef, note: '카드 명세서 확인', confirmed: true,
});
