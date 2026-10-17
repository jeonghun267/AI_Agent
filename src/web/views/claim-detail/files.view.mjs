import {html} from '../../core/html.mjs';
import {dateTime, fileSize} from '../../core/format.mjs';
import {saveBlob} from '../../core/dom.mjs';
import {emptyState, aiNote} from '../components/ui.view.mjs';
import {aiProgress} from '../components/ai-progress.view.mjs';
import {icon} from '../components/icons.view.mjs';

export const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf';

function uploadStatus(upload) {
  if (!upload) return '';
  return html`<div class="notice ${upload.error ? 'error' : ''}" role="status">
    <span>${upload.name} · ${upload.error || '서버에 저장하는 중…'}</span>
    ${upload.error && !upload.saving ? html`<button class="btn small" type="button" data-action="retry-upload">같은 파일 다시 시도</button>` : ''}
  </div>`;
}

const isImage = file => file.mime.startsWith('image/');

// Images show a thumbnail (filled in by hydrate() below); PDFs show an icon.
function evidenceCard(file, claim, {aiEnabled, ai}) {
  return html`<article class="evidence-card file-card">
    <button class="evidence-thumb" type="button" data-action="open-file" data-file="${file.id}" aria-label="${file.name} ${isImage(file) ? '보기' : '다운로드'}">
      ${isImage(file) ? html`<img data-thumb="${file.id}" alt="">` : ''}${icon(isImage(file) ? 'image' : 'file')}
    </button>
    <div class="evidence-info">
      <h3 title="${file.name}">${file.name}</h3>
      <small>${isImage(file) ? '사진' : 'PDF'} · ${fileSize(file.size)} · ${dateTime(file.createdAt)}</small>
      ${file.usedAsProof ? html`<span class="tag">회수 기록의 증빙</span>` : ''}
    </div>
    <div class="evidence-actions">
      <button class="btn small" type="button" data-action="open-file" data-file="${file.id}">${icon(isImage(file) ? 'image' : 'download')}${isImage(file) ? '보기' : '다운로드'}</button>
      ${aiEnabled && !claim.deleted ? html`<button class="btn small ai" type="button" data-action="extract-file" data-file="${file.id}" ${ai.busy ? html`disabled` : ''}>${icon('sparkle')}AI로 주문 정보 읽기</button>` : ''}
      ${!file.usedAsProof && !claim.deleted ? html`<button class="btn small ghost" type="button" data-action="remove-file" data-file="${file.id}">삭제</button>` : ''}
    </div>
    ${ai.target === file.id ? aiProgress(ai, 'extract') : ''}
  </article>`;
}

export function render(claim, {detail, session, ai}) {
  const aiEnabled = session.ai.enabled;
  return html`
    <div class="section-title"><div><h2>증빙</h2><p class="muted">주문서, 불량 사진, 판매처와 나눈 대화 캡처, 입금 확인 화면을 올려 두세요. 본인만 볼 수 있어요.</p></div>
      <span class="saved">${claim.files.length}개 저장됨</span></div>
    ${!claim.deleted ? html`<div class="drop" data-drop="evidence">
      <span class="drop-icon">${icon('upload')}</span>
      <strong>파일을 여기로 끌어 놓거나 골라 주세요</strong>
      <small>PNG · JPG · WebP · PDF, 파일당 10MB까지</small>
      <div class="actions center">
        <label class="btn small">${icon('file')}파일 선택<input id="upload-file" type="file" accept="${ACCEPT}" multiple hidden></label>
        <label class="btn small">${icon('camera')}사진 촬영<input id="capture-file" type="file" capture="environment" accept="image/jpeg,image/png,image/webp" hidden></label>
      </div>
    </div>` : ''}
    ${uploadStatus(detail.upload)}
    ${claim.files.length
      ? html`<div class="evidence-grid">${claim.files.map(file => evidenceCard(file, claim, {aiEnabled, ai}))}</div>`
      : emptyState('아직 올린 증빙이 없어요', '증빙이 있어야 문의를 보내고 회수를 기록할 수 있어요.', {compact: true})}
    ${aiEnabled && claim.files.length ? aiNote('AI로 읽은 값은 미리보기예요. 원문과 맞는지 확인한 뒤 "사건 정보에 반영"을 눌러야 저장돼요.') : ''}`;
}

// Uploads one file at a time; a failure stays on screen with a retry button.
export async function uploadEvidence(files, vms) {
  for (const file of [files].flat().filter(Boolean)) {
    try {
      await vms.detail.uploadFile(file);
      vms.app.notify(`증빙을 저장했어요. (${file.name})`);
    } catch {
      return;
    }
  }
}

// Thumbnails: image bytes are private, so they are fetched with the session
// and shown from object URLs, cached per claim so re-renders do not refetch.
const thumbnails = {claimId: null, urls: new Map()};

export function hydrate(root, vms) {
  const claimId = vms.detail.state.claim?.id ?? null;
  if (claimId !== thumbnails.claimId) {
    for (const url of thumbnails.urls.values()) if (url) URL.revokeObjectURL(url);
    thumbnails.claimId = claimId;
    thumbnails.urls.clear();
  }
  for (const img of root.querySelectorAll('img[data-thumb]:not([src])')) {
    const id = img.dataset.thumb;
    if (thumbnails.urls.get(id)) {
      img.src = thumbnails.urls.get(id);
      img.closest('.evidence-thumb')?.classList.add('has-image');
      continue;
    }
    if (thumbnails.urls.has(id)) continue;
    thumbnails.urls.set(id, '');
    vms.detail.downloadFile(id).then(blob => {
      if (thumbnails.claimId !== claimId) return;
      const url = URL.createObjectURL(blob);
      thumbnails.urls.set(id, url);
      for (const target of document.querySelectorAll(`img[data-thumb="${CSS.escape(id)}"]`)) {
        target.src = url;
        target.closest('.evidence-thumb')?.classList.add('has-image');
      }
    }, () => {});
  }
}

export const handlers = {
  change: {
    'upload-file': ({el, vms}) => uploadEvidence([...el.files], vms),
    'capture-file': ({el, vms}) => uploadEvidence(el.files[0], vms),
  },
  drop: {
    evidence: ({files, vms}) => uploadEvidence(files, vms),
  },
  click: {
    'retry-upload': ({vms}) => vms.detail.retryUpload().then(() => vms.app.notify('증빙을 저장했어요.'), () => {}),
    'open-file': async ({el, vms}) => {
      const file = vms.detail.state.claim.files.find(item => item.id === el.dataset.file);
      const blob = await vms.detail.downloadFile(file.id);
      if (isImage(file)) vms.app.openDialog('image', {url: URL.createObjectURL(blob), name: file.name});
      else saveBlob(blob, file.name);
    },
    'extract-file': ({el, vms}) => vms.ai.ensureConsent(() => vms.ai.extract(vms.detail.state.claim.id, el.dataset.file)),
    'remove-file': ({el, vms}) => vms.app.openDialog('confirm', {
      title: '증빙 삭제',
      message: '이 파일을 삭제할까요? 저장된 문의 초안은 다시 검토해야 해요.',
      confirmLabel: '삭제',
      run: async () => {
        await vms.detail.removeFile(el.dataset.file);
        vms.app.notify('증빙을 삭제했어요.');
      },
    }),
  },
};
