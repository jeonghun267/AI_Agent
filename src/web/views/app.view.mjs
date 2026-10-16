import {html, toMarkup} from '../core/html.mjs';
import {renderInto, trapFocus, formValues, focusables} from '../core/dom.mjs';
import {parseHash, routeHash} from '../core/hash-router.mjs';
import * as shell from './shell.view.mjs';
import * as auth from './pages/auth.view.mjs';
import * as dashboard from './pages/dashboard.view.mjs';
import * as trash from './pages/trash.view.mjs';
import * as settings from './pages/settings.view.mjs';
import * as claimDetail from './pages/claim-detail.view.mjs';
import * as claimForm from './dialogs/claim-form.view.mjs';
import * as receiptForm from './dialogs/receipt-form.view.mjs';
import * as replyForm from './dialogs/reply-form.view.mjs';
import * as draftDialogs from './dialogs/draft.view.mjs';
import * as misc from './dialogs/misc.view.mjs';

// Route name -> page renderer (signed-in pages only).
const PAGES = {
  dashboard: dashboard.renderDashboard,
  trash: trash.renderTrash,
  settings: settings.renderSettings,
  claim: claimDetail.renderClaimDetail,
};

// Dialog type -> renderer returning {title, body}. Opened via vms.app.openDialog(type, props).
const DIALOGS = {
  'claim-form': claimForm.render,
  receipt: receiptForm.render,
  reply: replyForm.render,
  'draft-preparing': draftDialogs.renderPreparing,
  'draft-editor': draftDialogs.renderEditor,
  'submit-draft': draftDialogs.renderSubmit,
  transition: misc.renderTransition,
  trash: misc.renderTrash,
  confirm: misc.renderConfirm,
  image: misc.renderImage,
  extraction: misc.renderExtraction,
  'delete-account': () => ({title: '회원 탈퇴', body: settings.renderDeleteAccountDialog()}),
};

const OVERLAYS = {'ai-consent': misc.renderAiConsent};

// Longest dialog exit transition in components.css (mobile sheet: 200ms) plus margin.
const CLOSE_ANIMATION_MS = 250;

const dialogHandlers = {
  click: {
    'close-dialog': ({vms}) => {
      vms.draft.cancel();
      vms.app.closeDialog();
    },
    'close-overlay': ({vms}) => vms.app.closeOverlay(),
  },
};

// Every view module exports `handlers = {click, submit, input, change}`.
// click keys are data-action names, submit keys are form ids, input/change keys are element ids.
const HANDLERS = [shell, auth, dashboard, trash, settings, claimDetail, ...claimDetail.tabViews, claimForm, receiptForm, replyForm, draftDialogs, misc, {handlers: dialogHandlers}]
  .reduce((all, view) => {
    for (const type of ['click', 'submit', 'input', 'change']) Object.assign(all[type], view.handlers?.[type]);
    return all;
  }, {click: {}, submit: {}, input: {}, change: {}});

function dialogMarkup({title, body}, closeAction) {
  return toMarkup(html`<header class="modal-head"><h2 id="${closeAction}-title">${title}</h2>
    <button class="btn ghost small" type="button" data-action="${closeAction}" aria-label="창 닫기">닫기</button></header>
    <div class="modal-body">${body}</div>`);
}

function showError(form, error, vms) {
  const target = form?.querySelector('.error');
  if (target) target.textContent = error.message;
  else vms.app.notify(error.message);
}

// Connects ViewModels to the DOM: re-renders on any state change, routes DOM
// events to handlers, and keeps location.hash and the dialogs in sync.
export function mountApp({root, modal, overlay, toast}, vms) {
  let scheduled = false;
  let shown = {dialog: null, overlay: null, toast: null};

  const snapshot = () => ({
    app: vms.app.state, session: vms.session.state, list: vms.list.state,
    detail: vms.detail.state, draft: vms.draft.state, ai: vms.ai.state,
  });

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; render(); });
  }

  function renderLayer(element, layer, renderers, closeAction, s) {
    const current = s.app[layer];
    if (current === shown[layer]) return;
    const previous = shown[layer];
    shown[layer] = current;
    if (previous?.type === 'image') URL.revokeObjectURL(previous.props.url);
    if (!current) {
      if (element.open) element.close();
      // Keep the content until the closing transition (DESIGN.md §8) has played.
      setTimeout(() => { if (!element.open) element.innerHTML = ''; }, CLOSE_ANIMATION_MS);
      return;
    }
    element.innerHTML = dialogMarkup(renderers[current.type](current.props, s), closeAction);
    element.setAttribute('aria-labelledby', `${closeAction}-title`);
    if (!element.open) element.showModal();
    (element.querySelector('input:not([type="hidden"]), textarea, select') ?? focusables(element)[0])?.focus();
  }

  function render() {
    const s = snapshot();
    if (s.session.status === 'loading') renderInto(root, html`<div class="boot" role="status">불러오는 중…</div>`);
    else if (s.session.status !== 'signedIn') renderInto(root, s.app.route.name === 'signup' ? auth.renderSignup(s) : auth.renderLogin(s));
    else renderInto(root, shell.renderShell(s, PAGES[s.app.route.name]?.(s) ?? ''));

    // Fade new content in only when the route (page or tab) changes, never on
    // ordinary re-renders such as typing in the search box.
    const hash = routeHash(s.app.route);
    const routeKey = `${s.session.status}:${hash}`;
    if (routeKey !== shown.routeKey) {
      shown.routeKey = routeKey;
      root.querySelector('#main')?.classList.add('route-enter');
      // On narrow screens the tab strip scrolls; keep the current tab visible.
      root.querySelector('.tabs a.active')?.scrollIntoView({block: 'nearest', inline: 'center'});
    }

    if (s.session.status !== 'loading' && location.hash !== hash) {
      const redirect = ['login', 'signup'].includes(s.app.route.name);
      history[redirect ? 'replaceState' : 'pushState'](null, '', hash);
    }

    renderLayer(modal, 'dialog', DIALOGS, 'close-dialog', s);
    renderLayer(overlay, 'overlay', OVERLAYS, 'close-overlay', s);

    if (s.app.toast !== shown.toast) {
      shown.toast = s.app.toast;
      toast.textContent = shown.toast?.message ?? '';
      toast.classList.toggle('show', !!shown.toast);
    }
  }

  for (const vm of Object.values(vms)) vm.subscribe(schedule);

  // Clicking a [data-action] runs its handler; the button is disabled meanwhile.
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-action]');
    const handler = el && HANDLERS.click[el.dataset.action];
    if (!handler) return;
    event.preventDefault();
    if (el.disabled) return;
    el.disabled = true;
    el.setAttribute('aria-busy', 'true');
    try {
      await handler({el, event, vms});
    } catch (error) {
      showError(el.closest('form'), error, vms);
    } finally {
      el.disabled = false;
      el.removeAttribute('aria-busy');
    }
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    const handler = HANDLERS.submit[form.id];
    if (!handler) return;
    event.preventDefault();
    if (form.dataset.saving) return;
    form.dataset.saving = 'true';
    const submit = form.querySelector('[type="submit"]');
    submit?.setAttribute('aria-busy', 'true');
    if (submit) submit.disabled = true;
    const error = form.querySelector('.error');
    if (error) error.textContent = '';
    try {
      await handler({form, values: formValues(form), vms, event});
    } catch (failure) {
      showError(form, failure, vms);
      form.querySelector(':user-invalid, [aria-invalid="true"]')?.focus();
    } finally {
      delete form.dataset.saving;
      if (submit) {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
    }
  });

  for (const type of ['input', 'change']) {
    document.addEventListener(type, event => {
      const handler = HANDLERS[type][event.target.id];
      if (handler) Promise.resolve(handler({el: event.target, event, vms})).catch(error => vms.app.notify(error.message));
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const open = overlay.open ? overlay : modal.open ? modal : null;
    if (open) trapFocus(open, event);
  });

  // Escape closes a dialog through the ViewModel so state stays the source of truth.
  modal.addEventListener('cancel', event => { event.preventDefault(); vms.draft.cancel(); vms.app.closeDialog(); });
  overlay.addEventListener('cancel', event => { event.preventDefault(); vms.app.closeOverlay(); });

  window.addEventListener('hashchange', () => {
    const route = parseHash(location.hash);
    if (routeHash(route) !== routeHash(vms.app.state.route)) vms.app.setRoute(route);
  });
  window.addEventListener('popstate', () => {
    const route = parseHash(location.hash);
    if (routeHash(route) !== routeHash(vms.app.state.route)) vms.app.setRoute(route);
  });
  window.addEventListener('offline', () => vms.app.setOffline(true));
  window.addEventListener('online', () => {
    vms.app.setOffline(false);
    vms.app.notify('연결이 돌아왔어요. 저장하지 못한 요청은 다시 시도하세요.');
  });
  window.addEventListener('pagehide', () => vms.draft.cancel());

  render();
}
