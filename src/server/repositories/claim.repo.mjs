const toClaimRow = row => row ? {
  id: row.id,
  ownerId: row.owner_id,
  payload: JSON.parse(row.payload),
  state: row.state,
  version: row.version,
  dataRev: row.data_rev,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
} : null;

export function createClaimRepository(db) {
  return {
    findRow(ownerId, id, {includeDeleted = false} = {}) {
      const sql = 'SELECT * FROM claims WHERE id = ? AND owner_id = ?' + (includeDeleted ? '' : ' AND deleted_at IS NULL');
      return toClaimRow(db.prepare(sql).get(id, ownerId));
    },

    listRows(ownerId, {deleted = false} = {}) {
      const sql = `SELECT * FROM claims WHERE owner_id = ? AND deleted_at IS ${deleted ? 'NOT NULL' : 'NULL'} ORDER BY updated_at DESC`;
      return db.prepare(sql).all(ownerId).map(toClaimRow);
    },

    listAllRows(ownerId) {
      return db.prepare('SELECT * FROM claims WHERE owner_id = ? ORDER BY created_at').all(ownerId).map(toClaimRow);
    },

    insert({id, ownerId, payload, state, createdAt}) {
      db.prepare('INSERT INTO claims(id, owner_id, payload, state, version, data_rev, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, NULL, ?, ?)')
        .run(id, ownerId, JSON.stringify(payload), state, createdAt, createdAt);
    },

    // Every change bumps version (optimistic locking). factsChanged also bumps
    // data_rev, which invalidates inquiry drafts written from older facts.
    update(ownerId, id, {payload, state, deletedAt, factsChanged = false, updatedAt}) {
      const sets = ['version = version + 1', 'updated_at = ?'];
      const values = [updatedAt];
      if (factsChanged) sets.push('data_rev = data_rev + 1');
      if (payload !== undefined) { sets.push('payload = ?'); values.push(JSON.stringify(payload)); }
      if (state !== undefined) { sets.push('state = ?'); values.push(state); }
      if (deletedAt !== undefined) { sets.push('deleted_at = ?'); values.push(deletedAt); }
      db.prepare(`UPDATE claims SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`).run(...values, id, ownerId);
    },
  };
}
