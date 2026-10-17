import {html, toMarkup} from '../core/html.mjs';
import {renderInto, trapFocus, formValues, focusables} from '../core/dom.mjs';
import {parseHash, routeHash, isLinkHash} from '../core/hash-router.mjs';
import * as shell from './shell.view.mjs';
import * as auth from './pages/auth.view.mjs';
import * as dashboard from './pages/dashboard.view.mjs';
import * as claims from './pages/claims.view.mjs';
import * as trash from './pages/trash.view.mjs';
import * as settings from './pages/settings.view.mjs';
import * as claimDetail from './pages/claim-detail.view.mjs';
import * as files from './claim-detail/files.view.mjs';
import * as claimForm from './dialogs/claim-form.view.mjs';
import * as receiptForm from './dialogs/receipt-form.view.mjs';
import * as replyForm from './dialogs/reply-form.view.mjs';
import * as draftDialogs from './dialogs/draft.view.mjs';
import * as misc from './dialogs/misc.view.mjs';
import * as stepper from './components/stepper.view.mjs';
import * as nextAction from './components/next-action.view.mjs';
import {aiProgress, aiHint} from './components/ai-progress.view.mjs';
import {validateForm, showFieldError, clearFieldError} from './components/form-feedback.view.mjs';

// Route name -> page renderer (signed-in pages only).
const PAGES = {
  dashboard: dashboard.renderDashboard,
  claims: claims.renderClaims,
  trash: trash.renderTrash,
  settings: settings.renderSettings,
  claim: claimDetail.renderClaimDetail,
};

// Route name -> signed-out screen (a centred card, no shell). Unknown names show login.
const AUTH_PAGES = {
  login: auth.renderLogin,
  signup: auth.renderSignup,
  forgot: auth.renderForgot,
  reset: auth.renderReset,
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
  celebrate: misc.renderCelebrate,
  'delete-account': () => ({title: '회원 탈퇴', body: settings.renderDeleteAccountDialog()}),
};

const OVERLAYS = {'ai-consent': misc.renderAiConsent, discard: misc.renderDiscard};

// A dialog form becomes "dirty" when the user types in it (or it holds AI output).
const hasUnsavedInput = () => !!document.querySelector('#modal form[data-dirty]');

// Closing a dialog with unsaved input asks first, on top of the dialog.
function requestCloseDialog(vms) {
  const close = () => {
    vms.draft.cancel();
    vms.app.closeDialog();
  };
  if (hasUnsavedInput()) vms.app.openOverlay('discard', {onDiscard: close});
  else close();
}

// Longest dialog exit transition in components.css (mobile sheet: 200ms) plus margin.
const CLOSE_ANIMATION_MS = 250;

const dialogHandlers = {
  click: {
    'close-dialog': ({vms}) => requestCloseDialog(vms),
    'close-overlay': ({vms}) => vms.app.closeOverlay(),
    'discard-dialog': ({vms}) => {
      const {onDiscard} = vms.app.state.overlay.props;
      vms.app.closeOverlay();
      onDiscard();
    },
    'cancel-ai': ({vms}) => vms.ai.cancel(),
  },
};

// Every view module exports `handlers = {click, submit, input, change, drop}`.
// click keys are data-action names, submit keys are form ids, drop keys are
// data-drop names, input/change keys are element ids ("form:<id>" catches any
// element of that form that has no handler of its own).
const HANDLER_TYPES = ['click', 'submit', 'input', 'change', 'drop'];
const HANDLERS = [shell, auth, dashboard, claims, trash, settings, claimDetail, ...claimDetail.tabViews, claimForm, receiptForm, replyForm, draftDialogs, misc, stepper, nextAction, {handlers: dialogHandlers}]
  .reduce((all, view) => {
    for (const type of HANDLER_TYPES) Object.assign(all[type], view.handlers?.[type]);
    return all;
  }, Object.fromEntries(HANDLER_TYPES.map(type => [type, {}])));

const fieldHandler = (type, el) => HANDLERS[type][el.id] ?? (el.form ? HANDLERS[type][`form:${el.form.id}`] : undefined);

// Puts the keyboard on the field that needs attention, showing its step first.
function focusField(input) {
  stepper.revealField(input);
  input.focus();
}

function dialogMarkup({title, body}, closeAction) {
  return toMarkup(html`<header class="modal-head"><h2 id="${closeAction}-title">${title}</h2>
    <button class="btn ghost small" type="button" data-action="${closeAction}" aria-label="창 닫기">닫기</button></header>
    <div class="modal-body">${body}</div>`);
}

function showError(form, error, vms) {
  if (error.code === 'cancelled') {
    vms.app.notify('AI 작업을 취소했어요.');
    return;
  }
  const target = form?.querySelector('.error');
  if (target) target.textContent = error.message;
  else vms.app.notify(error.message);
}

// Connects ViewModels to the DOM: re-renders on any state change, routes DOM
// events to handlers, and keeps location.hash and the dialogs in sync.
export function mountApp({root, modal, overlay, toast}, vms) {
  let scheduled = false;
  let shown = {dialog: null, overlay: null, toast: null, aiBusy: ''};
  let aiTicker = null;

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
    const rendered = renderers[current.type](current.props, s);
    element.innerHTML = dialogMarkup(rendered, closeAction);
    element.dataset.size = rendered.size ?? '';
    element.setAttribute('aria-labelledby', `${closeAction}-title`);
    if (!element.open) element.showModal();
    const firstInput = [...element.querySelectorAll('input:not([type="hidden"]), textarea, select')].find(input => input.getClientRects().length);
    (element.querySelector('[autofocus]') ?? firstInput ?? focusables(element)[0])?.focus();
  }

  function render() {
    const s = snapshot();
    if (s.session.status === 'loading') renderInto(root, html`<div class="boot" role="status">불러오는 중…</div>`);
    else if (s.session.status !== 'signedIn' || s.app.route.name === 'reset') renderInto(root, (AUTH_PAGES[s.app.route.name] ?? auth.renderLogin)(s));
    else renderInto(root, shell.renderShell(s, PAGES[s.app.route.name]?.(s) ?? ''));
    files.hydrate(root, vms);

    // Fade new content in only when the route (page or tab) changes, never on
    // ordinary re-renders such as typing in the search box.
    const hash = routeHash(s.app.route);
    const routeKey = `${s.session.status}:${hash}`;
    if (routeKey !== shown.routeKey) {
      shown.routeKey = routeKey;
      root.querySelector('#main')?.classList.add('route-enter');
      // A new page starts at the top; switching tabs inside a claim keeps the place.
      const pageKey = `${s.session.status}:${s.app.route.name}:${s.app.route.id ?? ''}`;
      if (pageKey !== shown.pageKey) {
        if (shown.pageKey) window.scrollTo({top: 0});
        shown.pageKey = pageKey;
      }
      // On narrow screens the tab strip scrolls sideways; centre the current tab
      // without moving the page up or down.
      const active = root.querySelector('.tabs a.active');
      if (active) {
        const strip = active.parentElement;
        const [tab, box] = [active.getBoundingClientRect(), strip.getBoundingClientRect()];
        strip.scrollLeft += tab.left - box.left - (box.width - tab.width) / 2;
      }
    }

    if (s.session.status !== 'loading' && location.hash !== hash) {
      // A one-time link is replaced, not kept in history, once it has been used.
      const redirect = ['login', 'signup'].includes(s.app.route.name) || isLinkHash(location.hash);
      history[redirect ? 'replaceState' : 'pushState'](null, '', hash);
    }

    renderLayer(modal, 'dialog', DIALOGS, 'close-dialog', s);
    renderLayer(overlay, 'overlay', OVERLAYS, 'close-overlay', s);
    renderAiProgress(s);
    // Our own inline errors replace the browser's pop-up bubbles.
    for (const form of document.querySelectorAll('form')) form.noValidate = true;

    if (s.app.toast !== shown.toast) {
      shown.toast = s.app.toast;
      toast.textContent = shown.toast?.message ?? '';
      toast.classList.toggle('show', !!shown.toast);
    }
    // A modal dialog makes the rest of the page inert and covers it, so the
    // toast lives inside the topmost open dialog while one is open.
    const host = overlay.open ? overlay : modal.open ? modal : document.body;
    if (toast.parentElement !== host) host.append(toast);
  }

  // Pages render their AI progress rows from state. Dialogs are not re-rendered
  // on every change, so their [data-ai-slot] placeholders are filled here.
  function renderAiProgress(s) {
    for (const slot of document.querySelectorAll('dialog [data-ai-slot]')) {
      const active = s.ai.busy === slot.dataset.aiSlot;
      if (active !== (slot.dataset.active === 'true')) {
        renderInto(slot, active ? aiProgress(s.ai, slot.dataset.aiSlot) : '');
        slot.dataset.active = String(active);
      }
    }
    if (s.ai.busy === shown.aiBusy) return;
    shown.aiBusy = s.ai.busy;
    clearInterval(aiTicker);
    if (!s.ai.busy) return;
    // Seconds counter: updates text in place instead of re-rendering.
    aiTicker = setInterval(() => {
      const seconds = Math.floor((Date.now() - vms.ai.state.startedAt) / 1000);
      for (const el of document.querySelectorAll('[data-ai-elapsed]')) el.textContent = `${seconds}초`;
      for (const el of document.querySelectorAll('[data-ai-hint]')) el.textContent = aiHint(seconds);
    }, 1000);
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

  // Submit: check inputs in the page (errors under each input), then call the
  // handler; a server error that names an input is shown under that input too.
  document.addEventListener('submit', async event => {
    const form = event.target;
    const handler = HANDLERS.submit[form.id];
    if (!handler) return;
    event.preventDefault();
    if (form.dataset.saving) return;
    // In a step-by-step form, Enter before the last step means "다음".
    if (stepper.interceptSubmit(form)) return;
    const error = form.querySelector('.error');
    if (error) error.textContent = '';
    const firstInvalid = validateForm(form);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }
    form.dataset.saving = 'true';
    const submit = form.querySelector('[type="submit"]');
    submit?.setAttribute('aria-busy', 'true');
    if (submit) submit.disabled = true;
    try {
      await handler({form, values: formValues(form), vms, event});
    } catch (failure) {
      const input = failure.field ? showFieldError(form, failure.field, failure.message) : null;
      if (input) focusField(input);
      else showError(form, failure, vms);
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
      const form = event.target.form;
      // Editing an input clears its error; typing in a dialog marks the form as unsaved.
      clearFieldError(event.target);
      if (form?.closest('dialog') && event.target.type !== 'file') form.dataset.dirty = 'true';
      const handler = fieldHandler(type, event.target);
      if (handler) Promise.resolve(handler({el: event.target, event, vms})).catch(error => showError(null, error, vms));
    });
  }

  // Dropping files on a [data-drop] area hands them to its handler. Files
  // dropped anywhere else are ignored instead of opening in the tab.
  const dropZone = event => event.target.closest?.('[data-drop]');
  const carriesFiles = event => [...(event.dataTransfer?.types ?? [])].includes('Files');
  document.addEventListener('dragover', event => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    const zone = dropZone(event);
    event.dataTransfer.dropEffect = zone ? 'copy' : 'none';
    zone?.classList.add('is-over');
  });
  document.addEventListener('dragleave', event => {
    const zone = dropZone(event);
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('is-over');
  });
  document.addEventListener('drop', event => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    const zone = dropZone(event);
    zone?.classList.remove('is-over');
    const handler = zone && HANDLERS.drop[zone.dataset.drop];
    if (handler) Promise.resolve(handler({el: zone, files: [...event.dataTransfer.files], vms})).catch(error => showError(null, error, vms));
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const open = overlay.open ? overlay : modal.open ? modal : null;
    if (open) trapFocus(open, event);
  });

  // Escape closes a dialog through the ViewModel so state stays the source of truth.
  modal.addEventListener('cancel', event => { event.preventDefault(); requestCloseDialog(vms); });
  // Reloading or leaving the page with unsaved dialog input asks the browser to confirm.
  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedInput()) return;
    event.preventDefault();
    event.returnValue = '';
  });
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
