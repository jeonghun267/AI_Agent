import {html, raw} from '../../core/html.mjs';

// Small building blocks shared by pages and dialogs. Pure: state in, HTML out.
// `attrs` is trusted markup written by our own views (min, max, inputmode).

export const statePill = (state, labels) => html`<span class="pill ${state}">${labels[state] ?? state}</span>`;

export function field(label, name, value = '', {type = 'text', required = false, attrs = '', hint = '', full = false} = {}) {
  return html`<div class="field${full ? ' full' : ''}">
    <label for="field-${name}">${label}${required ? html`<span class="required" aria-hidden="true"> *</span>` : ''}</label>
    <input id="field-${name}" name="${name}" type="${type}" value="${value ?? ''}" ${required ? html`required` : ''} ${raw(attrs)}>
    ${hint ? html`<small>${hint}</small>` : ''}
  </div>`;
}

export function textArea(label, name, value = '', {required = false, maxLength = 3000, hint = '', extra = ''} = {}) {
  return html`<div class="field full">
    <div class="label-row"><label for="field-${name}">${label}${required ? html`<span class="required" aria-hidden="true"> *</span>` : ''}</label>${extra}</div>
    <textarea id="field-${name}" name="${name}" maxlength="${maxLength}" ${required ? html`required` : ''}>${value ?? ''}</textarea>
    ${hint ? html`<small>${hint}</small>` : ''}
  </div>`;
}

export function selectField(label, name, options, selected, {full = false} = {}) {
  return html`<div class="field${full ? ' full' : ''}">
    <label for="field-${name}">${label}</label>
    <select id="field-${name}" name="${name}">
      ${options.map(([value, text]) => html`<option value="${value}" ${value === selected ? html`selected` : ''}>${text}</option>`)}
    </select>
  </div>`;
}

export const checkbox = (name, label, {required = false} = {}) =>
  html`<label class="check"><input type="checkbox" name="${name}" ${required ? html`required` : ''}><span>${label}</span></label>`;

export const formError = () => html`<p class="error" role="alert"></p>`;

export const formActions = (submitLabel = '저장', {cancelLabel = '취소', danger = false} = {}) => html`
  ${formError()}
  <div class="form-actions">
    <button class="btn" type="button" data-action="close-dialog">${cancelLabel}</button>
    <button class="btn ${danger ? 'danger-fill' : 'primary'}" type="submit">${submitLabel}</button>
  </div>`;

export const emptyState = (title, body = '') => html`<div class="empty"><h2>${title}</h2>${body ? html`<p>${body}</p>` : ''}</div>`;

export const aiNote = text => html`<div class="ai-note">${text}</div>`;
