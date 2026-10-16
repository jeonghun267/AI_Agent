export function createAiUsageRepository(db) {
  return {
    insert({id, ownerId, claimId, capability, model, inputTokens, outputTokens, ok, errorCode, createdAt}) {
      db.prepare('INSERT INTO ai_usage(id, owner_id, claim_id, capability, model, input_tokens, output_tokens, ok, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, ownerId, claimId, capability, model, inputTokens, outputTokens, ok ? 1 : 0, errorCode, createdAt);
    },

    countSince(ownerId, sinceIso) {
      return db.prepare('SELECT COUNT(*) AS count FROM ai_usage WHERE owner_id = ? AND created_at >= ?').get(ownerId, sinceIso).count;
    },
  };
}
