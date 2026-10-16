const toEntry = row => ({
  id: row.id,
  claimId: row.claim_id,
  kind: row.kind,
  amount: row.amount,
  quantity: row.quantity,
  receivedOn: row.received_on,
  note: row.note,
  proofId: row.proof_id,
  reverses: row.reverses,
  transactionRef: row.transaction_ref,
  createdAt: row.created_at,
});

// Append-only: there is no update or delete here, and triggers enforce it.
export function createLedgerRepository(db) {
  return {
    insert({id, ownerId, claimId, kind, amount, quantity, receivedOn, note, proofId, reverses, transactionRef, createdAt}) {
      db.prepare(`INSERT INTO ledger(id, owner_id, claim_id, kind, amount, quantity, received_on, note, proof_id, reverses, transaction_ref, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, ownerId, claimId, kind, amount, quantity, receivedOn, note, proofId, reverses, transactionRef, createdAt);
    },

    listForClaim(ownerId, claimId) {
      return db.prepare('SELECT * FROM ledger WHERE owner_id = ? AND claim_id = ? ORDER BY created_at, rowid').all(ownerId, claimId).map(toEntry);
    },

    findCashByRef(ownerId, transactionRef) {
      const row = db.prepare("SELECT * FROM ledger WHERE owner_id = ? AND kind = 'cash' AND transaction_ref = ?").get(ownerId, transactionRef);
      return row ? toEntry(row) : null;
    },
  };
}
