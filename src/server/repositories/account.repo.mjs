// Removes everything one user owns. Call inside a transaction. The purges row
// lifts the append-only triggers for this owner only, then is removed again.
const PURGE_ORDER = ['ai_usage', 'idempotency', 'audit', 'draft_submissions', 'drafts', 'ledger', 'files', 'claims', 'sessions', 'email_tokens'];
const USER_ID_TABLES = ['sessions', 'email_tokens'];

export function createAccountRepository(db) {
  return {
    purgeOwner(ownerId) {
      db.prepare('INSERT INTO purges(owner_id) VALUES (?)').run(ownerId);
      for (const table of PURGE_ORDER) {
        const column = USER_ID_TABLES.includes(table) ? 'user_id' : 'owner_id';
        db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(ownerId);
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(ownerId);
      db.prepare('DELETE FROM purges WHERE owner_id = ?').run(ownerId);
    },
  };
}
