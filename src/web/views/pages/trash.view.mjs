import {html} from '../../core/html.mjs';
import {pageHead, emptyState, skeletonCards} from '../components/ui.view.mjs';
import {claimCards} from '../components/claim-card.view.mjs';
import {icon} from '../components/icons.view.mjs';

export function renderTrash({list, session}) {
  let body;
  if (list.loading && !list.claims.length) body = skeletonCards(2);
  else if (!list.claims.length) body = html`<section class="panel">${emptyState('휴지통이 비어 있어요', '지운 클레임은 여기에 모이고, 언제든 복원할 수 있어요.', {dori: 'sm'})}</section>`;
  else body = claimCards(list.claims, session.config, {trash: true});
  return html`
    ${pageHead('휴지통', '지운 클레임도 증빙과 회수 기록은 그대로 남아 있어요.')}
    <p class="policy-note">${icon('shield')}<span>휴지통의 클레임은 저절로 지워지지 않아요. 영구 삭제는 회원 탈퇴 때 계정과 함께만 이루어져요.</span></p>
    ${body}`;
}

export const handlers = {
  click: {
    'restore-claim': async ({el, vms}) => {
      const claim = vms.list.state.claims.find(item => item.id === el.dataset.id);
      await vms.list.restore(claim);
      vms.app.notify('클레임을 복원했어요.');
    },
  },
};
