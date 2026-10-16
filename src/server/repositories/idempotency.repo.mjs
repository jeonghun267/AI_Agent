export function createIdempotencyRepository(db) {
  return {
    find(ownerId, key) {
      const row = db.prepare('SELECT * FROM idempotency WHERE owner_id = ? AND key = ?').get(ownerId, key);
      return row ? {action: row.action, inputHash: row.input_hash, result: JSON.parse(row.result)} : null;
    },

    insert({ownerId, key, action, inputHash, result, createdAt}) {
      db.prepare('INSERT INTO idempotency(owner_id, key, action, input_hash, result, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ownerId, key, action, inputHash, JSON.stringify(result), createdAt);
    },
  };
}
