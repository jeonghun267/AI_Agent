const toUser = row => row ? {
  id: row.id,
  email: row.email,
  name: row.name,
  emailVerifiedAt: row.email_verified_at,
  aiConsentAt: row.ai_consent_at,
  createdAt: row.created_at,
} : null;

export function createUserRepository(db) {
  return {
    findById(id) {
      return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    },

    // Only the auth service reads password material.
    findCredentialsByEmail(email) {
      return db.prepare('SELECT id, salt, password_hash AS passwordHash FROM users WHERE email = ?').get(email) ?? null;
    },

    findCredentialsById(id) {
      return db.prepare('SELECT id, salt, password_hash AS passwordHash FROM users WHERE id = ?').get(id) ?? null;
    },

    existsByEmail(email) {
      return !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
    },

    insert({id, email, name, salt, passwordHash, createdAt}) {
      db.prepare('INSERT INTO users(id, email, name, salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, email, name, salt, passwordHash, createdAt, createdAt);
    },

    setAiConsent(id, consentAt, updatedAt) {
      db.prepare('UPDATE users SET ai_consent_at = ?, updated_at = ? WHERE id = ?').run(consentAt, updatedAt, id);
    },
  };
}
