import {reject, forField} from '../domain/errors.mjs';
import {newId, nowIso, sha256} from '../domain/primitives.mjs';
import {cleanText} from '../domain/validation.mjs';
import {factualFingerprint} from '../domain/claim.mjs';
import {templateDraft} from '../domain/draft-template.mjs';
import {withIdempotency} from './idempotency.mjs';

const ORIGINS = ['ai', 'template', 'manual'];

// Inquiry drafts: the user edits a suggestion, saves immutable versions, and
// records that they sent the latest one themselves. The app never sends mail.
export function createDraftService(ctx) {
  const {repos, claims} = ctx;

  function template(ownerId, claimId) {
    return {
      origin: 'template',
      model: '',
      body: templateDraft(claims.detail(ownerId, claimId)),
      notice: '규칙 기반 영문 틀이에요. 사실과 다른 부분이 없는지 확인하고 고쳐 주세요.',
    };
  }

  function save(ownerId, claimId, version, input, key) {
    const body = cleanText(input.body, 15000);
    forField('body', () => reject(body.length < 20, '판매처에 보낼 문의 내용을 20자 이상 작성하세요.'));
    const origin = ORIGINS.includes(input.origin) ? input.origin : 'manual';
    const model = origin === 'ai' ? cleanText(input.model, 100) : '';

    withIdempotency(ctx, ownerId, key, `draft:save:${claimId}`, {version, body, origin}, () => {
      const row = claims.requireRow(ownerId, claimId);
      claims.expectVersion(row, version);
      claims.requireOpen(row);
      const files = repos.files.listForClaim(ownerId, claimId);
      const draftId = newId();
      const at = nowIso();
      repos.drafts.insert({id: draftId, ownerId, claimId, body, origin, model, dataRev: row.dataRev, fingerprint: factualFingerprint(row.payload, files), createdAt: at});
      const state = ['preparing', 'awaiting', 'review'].includes(row.state) ? 'review' : row.state;
      repos.claims.update(ownerId, claimId, {state, updatedAt: at});
      repos.audit.append(ownerId, claimId, '문의 버전 저장', {}, {draftId, origin, model, bodyHash: sha256(body), dataRev: row.dataRev});
      return {draftId};
    });
    return claims.detail(ownerId, claimId);
  }

  function submit(ownerId, claimId, version, input, key) {
    forField('confirmed', () => reject(input.confirmed !== true, '최신 문의 내용을 검토하고 판매처에 직접 보냈는지 확인해 주세요.'));
    const note = cleanText(input.note, 500);

    withIdempotency(ctx, ownerId, key, `draft:submit:${claimId}`, {version, draftId: input.draftId, note}, () => {
      const row = claims.requireRow(ownerId, claimId);
      claims.expectVersion(row, version);
      claims.requireOpen(row);
      const latest = claims.toView(ownerId, row, {withEvents: false}).drafts[0];
      reject(!latest || latest.id !== input.draftId || latest.stale,
        '가장 최근에 저장한 문의 버전으로 다시 확인하세요. 사건 정보가 바뀌었다면 새 버전을 저장해야 해요.');
      reject(latest.submittedAt, '이미 보낸 것으로 기록한 버전입니다.');
      const at = nowIso();
      repos.drafts.insertSubmission({draftId: latest.id, ownerId, note, submittedAt: at});
      const state = ['preparing', 'review'].includes(row.state) ? 'awaiting' : row.state;
      repos.claims.update(ownerId, claimId, {state, updatedAt: at});
      repos.audit.append(ownerId, claimId, '판매처에 보낸 사실 기록', {}, {draftId: latest.id, note, sentByApp: false});
      return {draftId: latest.id};
    });
    return claims.detail(ownerId, claimId);
  }

  return {template, save, submit};
}
