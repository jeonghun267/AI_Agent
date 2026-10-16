const toToken = row => row ? {userId: row.user_id, purpose: row.purpose, email: row.email, expiresAt: row.expires_at} : null;

export function createEmailTokenRepository(db) {
  return {
    insert({tokenHash, userId, purpose, email, expiresAt, createdAt}) {
      db.prepare('INSERT INTO email_tokens(token_hash, user_id, purpose, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(tokenHash, userId, purpose, email, expiresAt, createdAt);
    },

    // Deletes and returns the token in one statement, so two requests racing
    // with the same link cannot both use it. Expired rows are returned too;
    // the caller rejects them.
    take(tokenHash, purpose) {
      return toToken(db.prepare('DELETE FROM email_tokens WHERE token_hash = ? AND purpose = ? RETURNING *').get(tokenHash, purpose));
    },

    deleteForUser(userId, purpose) {
      db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose);
    },

    deleteExpired(nowMs) {
      db.prepare('DELETE FROM email_tokens WHERE expires_at <= ?').run(nowMs);
    },
  };
}
