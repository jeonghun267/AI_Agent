const META_COLUMNS = 'f.id, f.claim_id, f.name, f.mime, f.size, f.sha, f.created_at';

const toFileMeta = row => ({
  id: row.id,
  claimId: row.claim_id,
  name: row.name,
  mime: row.mime,
  size: row.size,
  sha: row.sha,
  createdAt: row.created_at,
});

export function createFileRepository(db) {
  return {
    insert({id, ownerId, claimId, name, mime, bytes, sha, createdAt}) {
      db.prepare('INSERT INTO files(id, owner_id, claim_id, name, mime, size, sha, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, ownerId, claimId, name, mime, bytes.length, sha, bytes, createdAt);
    },

    listForClaim(ownerId, claimId) {
      return db.prepare(`SELECT ${META_COLUMNS} FROM files f WHERE f.owner_id = ? AND f.claim_id = ? AND f.deleted_at IS NULL ORDER BY f.created_at`)
        .all(ownerId, claimId).map(toFileMeta);
    },

    // Files of a claim in the trash are not downloadable until it is restored.
    findWithBytes(ownerId, fileId) {
      const row = db.prepare(`SELECT ${META_COLUMNS}, f.bytes FROM files f JOIN claims c ON c.id = f.claim_id AND c.owner_id = f.owner_id
        WHERE f.id = ? AND f.owner_id = ? AND f.deleted_at IS NULL AND c.deleted_at IS NULL`).get(fileId, ownerId);
      return row ? {...toFileMeta(row), bytes: Buffer.from(row.bytes)} : null;
    },

    findActiveBySha(ownerId, claimId, sha) {
      const row = db.prepare(`SELECT ${META_COLUMNS} FROM files f WHERE f.owner_id = ? AND f.claim_id = ? AND f.sha = ? AND f.deleted_at IS NULL`)
        .get(ownerId, claimId, sha);
      return row ? toFileMeta(row) : null;
    },

    isUsedAsProof(ownerId, fileId) {
      return !!db.prepare('SELECT 1 FROM ledger WHERE owner_id = ? AND proof_id = ? LIMIT 1').get(ownerId, fileId);
    },

    softDelete(ownerId, fileId, deletedAt) {
      db.prepare('UPDATE files SET deleted_at = ? WHERE id = ? AND owner_id = ?').run(deletedAt, fileId, ownerId);
    },

    listAllWithBytes(ownerId) {
      return db.prepare(`SELECT ${META_COLUMNS}, f.bytes, f.deleted_at FROM files f WHERE f.owner_id = ? ORDER BY f.created_at`)
        .all(ownerId).map(row => ({...toFileMeta(row), deletedAt: row.deleted_at, bytes: Buffer.from(row.bytes)}));
    },
  };
}
