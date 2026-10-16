import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase, transaction} from '../../src/server/repositories/db.mjs';
import {createRepositories} from '../../src/server/repositories/index.mjs';
import {nowIso} from '../../src/server/domain/primitives.mjs';

async function database(t) {
  const dir = await mkdtemp(join(tmpdir(), 'relo-db-'));
  const db = openDatabase(dir);
  t.after(async () => { db.close(); await rm(dir, {recursive: true, force: true}); });
  return {db, repos: createRepositories(db)};
}

function seedOwner(repos, ownerId) {
  const at = nowIso();
  repos.users.insert({id: ownerId, email: `${ownerId}@example.test`, name: ownerId, salt: 's', passwordHash: 'h', createdAt: at});
  repos.claims.insert({id: `${ownerId}-claim`, ownerId, payload: {title: 't'}, state: 'preparing', createdAt: at});
  repos.files.insert({id: `${ownerId}-file`, ownerId, claimId: `${ownerId}-claim`, name: 'a.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-'), sha: 'x', createdAt: at});
  repos.ledger.insert({id: `${ownerId}-cash`, ownerId, claimId: `${ownerId}-claim`, kind: 'cash', amount: 100, quantity: 0, receivedOn: '2026-10-01', note: '', proofId: `${ownerId}-file`, reverses: null, transactionRef: '', createdAt: at});
  repos.audit.append(ownerId, `${ownerId}-claim`, '등록', {}, {});
}

test('migrations run once and reopening keeps data', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'relo-db-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const first = openDatabase(dir);
  seedOwner(createRepositories(first), 'u1');
  first.close();
  const reopened = openDatabase(dir);
  try {
    const migrations = readdirSync(join(import.meta.dirname, '../../src/server/repositories/migrations')).filter(name => name.endsWith('.sql'));
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, migrations.length);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM claims').get().n, 1);
  } finally {
    reopened.close();
  }
});

test('ledger, drafts and audit stay append-only outside an account purge', async t => {
  const {db, repos} = await database(t);
  seedOwner(repos, 'u1');
  assert.throws(() => db.prepare('DELETE FROM ledger').run(), /append-only ledger/);
  assert.throws(() => db.prepare("UPDATE audit SET action = 'x'").run(), /append-only audit/);
  assert.equal(repos.audit.verifyChain('u1').valid, true);
});

test('purging one owner removes all of their rows and nothing else', async t => {
  const {db, repos} = await database(t);
  seedOwner(repos, 'u1');
  seedOwner(repos, 'u2');
  transaction(db, () => repos.account.purgeOwner('u1'));
  for (const table of ['claims', 'files', 'ledger', 'audit']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE owner_id = 'u1'`).get().n, 0, table);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE owner_id = 'u2'`).get().n, 1, table);
  }
  assert.equal(repos.users.findById('u1'), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM purges').get().n, 0);
  assert.throws(() => db.prepare("DELETE FROM ledger WHERE owner_id = 'u2'").run(), /append-only ledger/);
});

test('nested transactions join the outer one and roll back together', async t => {
  const {db, repos} = await database(t);
  assert.throws(() => transaction(db, () => {
    transaction(db, () => repos.users.insert({id: 'n1', email: 'n1@example.test', name: 'n', salt: 's', passwordHash: 'h', createdAt: nowIso()}));
    throw new Error('boom');
  }), /boom/);
  assert.equal(repos.users.findById('n1'), null);
});
