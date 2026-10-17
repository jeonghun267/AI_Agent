import {toMarkup} from './html.mjs';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]';

// Replaces root's content but keeps keyboard focus (and caret) on the element
// with the same id, so typing in a search box survives a re-render.
export function renderInto(root, template) {
  const active = document.activeElement;
  const focusId = root.contains(active) ? active.id : '';
  const selection = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  root.innerHTML = toMarkup(template);
  if (!focusId) return;
  const again = root.querySelector(`#${CSS.escape(focusId)}`);
  if (!again) return;
  again.focus();
  if (selection && 'setSelectionRange' in again) {
    try { again.setSelectionRange(...selection); } catch { /* not a text input */ }
  }
}

export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length);
}

// Keeps Tab / Shift+Tab inside an open dialog.
export function trapFocus(dialog, event) {
  const controls = focusables(dialog);
  if (!controls.length) return;
  const index = controls.indexOf(document.activeElement);
  const last = controls.length - 1;
  if (index < 0 || (!event.shiftKey && index === last) || (event.shiftKey && index === 0)) {
    event.preventDefault();
    controls[event.shiftKey ? last : 0].focus();
  }
}

// Plain object of a form's named fields. Checkboxes become booleans; a radio
// group gives the value of its checked option.
export function formValues(form) {
  const values = {};
  for (const element of form.elements) {
    if (!element.name || element.disabled) continue;
    if (element.type === 'checkbox') values[element.name] = element.checked;
    else if (element.type === 'radio') { if (element.checked) values[element.name] = element.value; }
    else if (element.type === 'file') continue;
    else values[element.name] = element.value;
  }
  return values;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
