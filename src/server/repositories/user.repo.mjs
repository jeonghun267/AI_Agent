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

    findByEmail(email) {
      return toUser(db.prepare('SELECT * FROM users WHERE email = ?').get(email));
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

    setPassword(id, salt, passwordHash, updatedAt) {
      db.prepare('UPDATE users SET salt = ?, password_hash = ?, updated_at = ? WHERE id = ?').run(salt, passwordHash, updatedAt, id);
    },

    // Keeps the first confirmation time if the address was already verified.
    markEmailVerified(id, verifiedAt) {
      db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?').run(verifiedAt, verifiedAt, id);
    },

    setAiConsent(id, consentAt, updatedAt) {
      db.prepare('UPDATE users SET ai_consent_at = ?, updated_at = ? WHERE id = ?').run(consentAt, updatedAt, id);
    },
  };
}
