export function createSessionRepository(db) {
  return {
    insert({tokenHash, userId, csrf, expiresAt, createdAt}) {
      db.prepare('INSERT INTO sessions(token_hash, user_id, csrf, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(tokenHash, userId, csrf, expiresAt, createdAt);
    },

    find(tokenHash) {
      const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
      return row ? {tokenHash: row.token_hash, userId: row.user_id, csrf: row.csrf, expiresAt: row.expires_at} : null;
    },

    extend(tokenHash, expiresAt) {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(expiresAt, tokenHash);
    },

    delete(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },

    deleteForUser(userId) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    },

    deleteExpired(nowMs) {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowMs);
    },
  };
}
