import {html} from '../../core/html.mjs';
import {emptyState, skeletonRows} from '../components/ui.view.mjs';
import {claimTable} from './dashboard.view.mjs';

export function renderTrash({list, session}) {
  let body;
  if (list.loading && !list.claims.length) body = skeletonRows(2);
  else if (!list.claims.length) body = emptyState('휴지통이 비어 있어요', '지운 클레임은 여기에 모이고, 언제든 복원할 수 있어요.');
  else body = claimTable(list.claims, session.config, {trash: true});
  return html`
    <div class="heading"><div><h1>휴지통</h1><p>휴지통에 있는 건도 증빙과 회수 기록은 그대로 남아 있어요.</p></div></div>
    <section class="panel">${body}</section>`;
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
