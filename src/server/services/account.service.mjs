import {transaction} from '../repositories/db.mjs';
import {reject} from '../domain/errors.mjs';
import {nowIso} from '../domain/primitives.mjs';

export function createAccountService(ctx) {
  const {db, repos, auth, claims} = ctx;

  function setAiConsent(ownerId, consent) {
    const at = nowIso();
    repos.users.setAiConsent(ownerId, consent ? at : null, at);
    return repos.users.findById(ownerId);
  }

  // Everything we hold about the user, including deleted claims and files.
  function exportData(ownerId) {
    const user = repos.users.findById(ownerId);
    return {
      format: 'relo-export-v1',
      exportedAt: nowIso(),
      user: {email: user.email, name: user.name, createdAt: user.createdAt, aiConsentAt: user.aiConsentAt},
      claims: repos.claims.listAllRows(ownerId).map(row => claims.toView(ownerId, row)),
      files: repos.files.listAllWithBytes(ownerId).map(({bytes, ...meta}) => ({...meta, base64: bytes.toString('base64')})),
    };
  }

  // Permanent: removes the account and every row it owns.
  async function deleteAccount(ownerId, password) {
    reject(!(await auth.verifyPassword(ownerId, password)), '비밀번호가 맞지 않아요.', 'invalid_password', 403);
    transaction(db, () => repos.account.purgeOwner(ownerId));
  }

  return {setAiConsent, exportData, deleteAccount};
}
