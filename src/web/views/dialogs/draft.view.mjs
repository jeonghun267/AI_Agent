import {html} from '../../core/html.mjs';
import {newRequestKey} from '../../core/http-client.mjs';
import {field, checkbox, formActions} from '../components/ui.view.mjs';
import {doriPreparing} from '../components/dori.view.mjs';

export function renderPreparing({kind, useAi, still}, {session}) {
  return {title: '문의 준비', body: doriPreparing({kindLabel: session.config.claimKinds[kind], useAi, still})};
}

export function renderEditor({suggestion}) {
  return {
    title: '문의 내용 확인·저장',
    // An AI draft took time and API cost to make, so it counts as unsaved input from the start.
    body: html`<form id="draft-form" data-key="${newRequestKey()}" ${suggestion.origin === 'ai' ? html`data-dirty="true"` : ''}>
      ${suggestion.notice ? html`<div class="ai-note">${suggestion.notice}</div>` : ''}
      ${suggestion.summaryKo ? html`<p class="status-line"><strong>요약</strong> · ${suggestion.summaryKo}</p>` : ''}
      ${suggestion.missingInfo?.length ? html`<div class="notice warning"><span>채워야 할 정보: ${suggestion.missingInfo.join(', ')}</span></div>` : ''}
      <textarea class="draft-editor" name="body" required maxlength="15000" aria-label="영문 문의 내용" lang="en">${suggestion.body}</textarea>
      ${formActions('이 버전 저장')}
    </form>`,
  };
}

export function renderSubmit(_, {detail}) {
  const latest = detail.claim.drafts[0];
  return {
    title: '판매처에 보낸 사실 기록',
    body: html`<form id="submit-draft-form" data-key="${newRequestKey()}">
      <input type="hidden" name="draftId" value="${latest.id}">
      <div class="form-grid single">${field('보낸 곳·접수번호 (선택)', 'note', '', {attrs: 'maxlength="500" placeholder="예: 판매처 문의 폼, 접수번호 12345"'})}</div>
      ${checkbox('confirmed', '저장한 최신 버전을 검토했고, 판매처 공식 문의 창구에 직접 보냈어요.', {required: true})}
      <p class="status-line">ReLo는 메일을 보내지 않아요. 보낸 사실만 기록해요.</p>
      ${formActions('기록')}
    </form>`,
  };
}

export const handlers = {
  submit: {
    'draft-form': async ({form, values, vms}) => {
      await vms.draft.save(values.body, vms.app.state.dialog.props.suggestion, form.dataset.key);
      vms.app.notify('문의 버전을 저장했어요. 복사해서 판매처에 보낸 뒤 "보냈어요"를 눌러 주세요.');
    },
    'submit-draft-form': async ({form, values, vms}) => {
      await vms.detail.submitDraft({draftId: values.draftId, confirmed: values.confirmed, note: values.note}, form.dataset.key);
      vms.app.closeDialog();
      vms.app.notify('보낸 사실을 기록했어요. 판매처 답변이 오면 기록해 주세요.');
    },
  },
};
