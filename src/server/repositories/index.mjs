import {createUserRepository} from './user.repo.mjs';
import {createSessionRepository} from './session.repo.mjs';
import {createEmailTokenRepository} from './email-token.repo.mjs';
import {createClaimRepository} from './claim.repo.mjs';
import {createFileRepository} from './file.repo.mjs';
import {createLedgerRepository} from './ledger.repo.mjs';
import {createDraftRepository} from './draft.repo.mjs';
import {createAuditRepository} from './audit.repo.mjs';
import {createIdempotencyRepository} from './idempotency.repo.mjs';
import {createAiUsageRepository} from './ai-usage.repo.mjs';
import {createAccountRepository} from './account.repo.mjs';

export function createRepositories(db) {
  return {
    users: createUserRepository(db),
    sessions: createSessionRepository(db),
    emailTokens: createEmailTokenRepository(db),
    claims: createClaimRepository(db),
    files: createFileRepository(db),
    ledger: createLedgerRepository(db),
    drafts: createDraftRepository(db),
    audit: createAuditRepository(db),
    idempotency: createIdempotencyRepository(db),
    aiUsage: createAiUsageRepository(db),
    account: createAccountRepository(db),
  };
}
