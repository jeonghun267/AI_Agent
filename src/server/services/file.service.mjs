import {transaction} from '../repositories/db.mjs';
import {reject, notFound} from '../domain/errors.mjs';
import {newId, nowIso, sha256} from '../domain/primitives.mjs';
import {cleanText} from '../domain/validation.mjs';
import {withIdempotency} from './idempotency.mjs';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

// The declared type must match the file's leading bytes.
const SIGNATURES = {
  'application/pdf': bytes => bytes.subarray(0, 5).toString() === '%PDF-',
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': bytes => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
  'image/webp': bytes => bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
};
export const ALLOWED_FILE_TYPES = Object.keys(SIGNATURES);

export function createFileService(ctx) {
  const {db, repos, claims} = ctx;

  function upload(ownerId, claimId, version, {name, mime, bytes}, key) {
    claims.requireRow(ownerId, claimId);
    reject(!bytes.length || bytes.length > MAX_FILE_BYTES, '파일은 10MB 이하로 선택하세요.');
    reject(!SIGNATURES[mime]?.(bytes), 'PNG·JPG·WebP·PDF 파일만 올릴 수 있어요. 파일 형식을 확인하세요.');
    const sha = sha256(bytes);
    const safeName = cleanText(name, 150).replace(/[\x00-\x1f/\\]/g, '_') || 'evidence';

    const result = withIdempotency(ctx, ownerId, key, `file:upload:${claimId}`, {version, name: safeName, mime, sha}, () => {
      const row = claims.requireRow(ownerId, claimId);
      const existing = repos.files.findActiveBySha(ownerId, claimId, sha);
      if (existing) return {fileId: existing.id};
      claims.expectVersion(row, version);
      const fileId = newId();
      const at = nowIso();
      repos.files.insert({id: fileId, ownerId, claimId, name: safeName, mime, bytes, sha, createdAt: at});
      repos.claims.update(ownerId, claimId, {factsChanged: true, updatedAt: at});
      repos.audit.append(ownerId, claimId, '증빙 저장', {}, {fileId, name: safeName, size: bytes.length, sha});
      return {fileId};
    });
    return {claim: claims.detail(ownerId, claimId), fileId: result.fileId, duplicate: !!result.duplicate};
  }

  function download(ownerId, fileId) {
    const file = repos.files.findWithBytes(ownerId, fileId);
    if (!file) throw notFound('파일을 찾을 수 없습니다.');
    return file;
  }

  // For AI reading: the file must belong to the given (non-deleted) claim.
  function fileOfClaim(ownerId, claimId, fileId) {
    const file = download(ownerId, fileId);
    if (file.claimId !== claimId) throw notFound('이 건의 증빙 파일을 선택하세요.');
    return file;
  }

  function remove(ownerId, claimId, fileId, version) {
    return transaction(db, () => {
      const row = claims.requireRow(ownerId, claimId);
      claims.expectVersion(row, version);
      const file = fileOfClaim(ownerId, claimId, fileId);
      reject(repos.files.isUsedAsProof(ownerId, fileId), '회수 기록의 증빙으로 쓰인 파일은 삭제할 수 없어요.', 'file_in_use', 409);
      const at = nowIso();
      repos.files.softDelete(ownerId, fileId, at);
      repos.claims.update(ownerId, claimId, {factsChanged: true, updatedAt: at});
      repos.audit.append(ownerId, claimId, '증빙 삭제', {fileId, name: file.name}, {});
      return claims.detail(ownerId, claimId);
    });
  }

  return {upload, download, fileOfClaim, remove};
}
