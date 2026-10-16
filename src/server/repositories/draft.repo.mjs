const toDraft = row => ({
  id: row.id,
  body: row.body,
  origin: row.origin,
  model: row.model,
  dataRev: row.data_rev,
  fingerprint: row.fingerprint,
  createdAt: row.created_at,
  submittedAt: row.submitted_at ?? null,
  submissionNote: row.submission_note ?? '',
});

// Draft versions are immutable; a new edit is a new row.
export function createDraftRepository(db) {
  return {
    insert({id, ownerId, claimId, body, origin, model, dataRev, fingerprint, createdAt}) {
      db.prepare('INSERT INTO drafts(id, owner_id, claim_id, body, origin, model, data_rev, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, ownerId, claimId, body, origin, model, dataRev, fingerprint, createdAt);
    },

    // Newest first.
    listForClaim(ownerId, claimId) {
      return db.prepare(`SELECT d.*, s.submitted_at, s.note AS submission_note FROM drafts d
        LEFT JOIN draft_submissions s ON s.draft_id = d.id AND s.owner_id = d.owner_id
        WHERE d.owner_id = ? AND d.claim_id = ? ORDER BY d.created_at DESC, d.rowid DESC`).all(ownerId, claimId).map(toDraft);
    },

    insertSubmission({draftId, ownerId, note, submittedAt}) {
      db.prepare('INSERT INTO draft_submissions(draft_id, owner_id, note, submitted_at) VALUES (?, ?, ?, ?)').run(draftId, ownerId, note, submittedAt);
    },
  };
}
