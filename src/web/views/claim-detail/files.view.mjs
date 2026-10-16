import {html} from '../../core/html.mjs';
import {dateTime, fileSize} from '../../core/format.mjs';
import {saveBlob} from '../../core/dom.mjs';
import {emptyState, aiNote} from '../components/ui.view.mjs';

function uploadStatus(upload) {
  if (!upload) return '';
  return html`<div class="notice ${upload.error ? 'error' : ''}" role="status">
    <span>${upload.name} · ${upload.error || '서버 저장 확인 중'}</span>
    ${upload.error && !upload.saving ? html`<button class="btn small" type="button" data-action="retry-upload">같은 파일 다시 시도</button>` : ''}
  </div>`;
}

export function render(claim, {detail, session, ai}) {
  const aiEnabled = session.ai.enabled;
  return html`
    <div class="section-title"><div><h2>증빙</h2><p class="muted">주문 내역, 불량 사진, 입금 확인 화면 등을 올려 두세요. 본인만 볼 수 있어요.</p></div>
      <span class="saved">${claim.files.length}개 저장됨</span></div>
    ${!claim.deleted ? html`<div class="drop">
      <strong>PNG · JPG · WebP · PDF, 파일당 10MB까지</strong>
      <div class="actions center">
        <label class="btn small">파일 선택<input id="upload-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden></label>
        <label class="btn small">사진 촬영<input id="capture-file" type="file" capture="environment" accept="image/jpeg,image/png,image/webp" hidden></label>
      </div>
    </div>` : ''}
    ${uploadStatus(detail.upload)}
    ${claim.files.length ? claim.files.map(file => html`<article class="item-card file-card">
      <div>
        <h3>${file.name}</h3>
        <small class="case-caption"><span>${fileSize(file.size)}</span><span>${dateTime(file.createdAt)}</span>${file.usedAsProof ? html`<span>회수 기록의 증빙</span>` : ''}</small>
      </div>
      <div class="actions">
        <button class="btn small" type="button" data-action="open-file" data-file="${file.id}">${file.mime.startsWith('image/') ? '보기' : '다운로드'}</button>
        ${aiEnabled && !claim.deleted ? html`<button class="btn small" type="button" data-action="extract-file" data-file="${file.id}" ${ai.busy === 'extract' ? html`disabled` : ''}>${ai.busy === 'extract' ? 'AI가 읽는 중…' : 'AI로 주문 정보 읽기'}</button>` : ''}
        ${!file.usedAsProof && !claim.deleted ? html`<button class="btn small ghost" type="button" data-action="remove-file" data-file="${file.id}">삭제</button>` : ''}
      </div>
    </article>`) : emptyState('아직 올린 증빙이 없어요')}
    ${aiEnabled ? aiNote('AI로 읽은 값은 미리보기예요. 확인한 뒤 "사건 정보에 반영"을 눌러 직접 저장해야 반영돼요.') : ''}`;
}

async function upload(file, vms) {
  if (!file) return;
  try {
    await vms.detail.uploadFile(file);
    vms.app.notify('증빙을 저장했어요.');
  } catch {
    // The error is shown next to the file with a retry button.
  }
}

export const handlers = {
  change: {
    'upload-file': ({el, vms}) => upload(el.files[0], vms),
    'capture-file': ({el, vms}) => upload(el.files[0], vms),
  },
  click: {
    'retry-upload': ({vms}) => vms.detail.retryUpload().then(() => vms.app.notify('증빙을 저장했어요.'), () => {}),
    'open-file': async ({el, vms}) => {
      const file = vms.detail.state.claim.files.find(item => item.id === el.dataset.file);
      const blob = await vms.detail.downloadFile(file.id);
      if (file.mime.startsWith('image/')) vms.app.openDialog('image', {url: URL.createObjectURL(blob), name: file.name});
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
