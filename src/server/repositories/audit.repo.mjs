import {newId, nowIso, sha256} from '../domain/primitives.mjs';

const chainHash = entry => sha256(JSON.stringify([
  entry.prevHash, entry.id, entry.createdAt, entry.action, entry.entity, entry.beforeJson, entry.afterJson,
]));

// Append-only change history per owner, linked by a hash chain so silent edits
// are detectable (see scripts/backup-db.mjs --verify). Not an external attestation.
export function createAuditRepository(db) {
  return {
    append(ownerId, entity, action, before = {}, after = {}) {
      const prev = db.prepare('SELECT hash FROM audit WHERE owner_id = ? ORDER BY seq DESC LIMIT 1').get(ownerId);
      const entry = {
        id: newId(),
        entity,
        action,
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify(after),
        createdAt: nowIso(),
        prevHash: prev?.hash ?? '',
      };
      db.prepare('INSERT INTO audit(id, owner_id, entity, action, before_json, after_json, created_at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(entry.id, ownerId, entity, action, entry.beforeJson, entry.afterJson, entry.createdAt, entry.prevHash, chainHash(entry));
    },

    listForEntity(ownerId, entity, limit = 200) {
      return db.prepare('SELECT id, action, before_json, after_json, created_at FROM audit WHERE owner_id = ? AND entity = ? ORDER BY seq DESC LIMIT ?')
        .all(ownerId, entity, limit)
        .map(row => ({id: row.id, action: row.action, before: JSON.parse(row.before_json), after: JSON.parse(row.after_json), createdAt: row.created_at}));
    },

    verifyChain(ownerId) {
      let previous = '';
      const rows = db.prepare('SELECT * FROM audit WHERE owner_id = ? ORDER BY seq').all(ownerId);
      for (const row of rows) {
        const entry = {prevHash: row.prev_hash, id: row.id, createdAt: row.created_at, action: row.action, entity: row.entity, beforeJson: row.before_json, afterJson: row.after_json};
        if (row.prev_hash !== previous || row.hash !== chainHash(entry)) return {valid: false, count: rows.length};
        previous = row.hash;
      }
      return {valid: true, count: rows.length};
    },
  };
}
