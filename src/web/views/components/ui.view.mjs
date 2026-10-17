import {html, raw} from '../../core/html.mjs';
import {doriFigure} from './dori.view.mjs';
import {icon} from './icons.view.mjs';

// Small building blocks shared by pages and dialogs. Pure: state in, HTML out.
// `attrs` is trusted markup written by our own views (min, max, inputmode).

export const statePill = (state, labels) => html`<span class="pill ${state}">${labels[state] ?? state}</span>`;

// Page title row: title and one sentence on the left, actions on the right.
export function pageHead(title, lead = '', actions = '') {
  return html`<div class="heading">
    <div><h1>${title}</h1>${lead ? html`<p>${lead}</p>` : ''}</div>
    ${actions}
  </div>`;
}

// prefix: a short label shown inside the input's left edge (the currency of an
// amount). It carries data-affix so the form can update it when the currency changes.
export function field(label, name, value = '', {type = 'text', required = false, attrs = '', hint = '', full = false, prefix = ''} = {}) {
  const input = html`<input id="field-${name}" name="${name}" type="${type}" value="${value ?? ''}" ${required ? html`required` : ''} ${raw(attrs)}>`;
  return html`<div class="field${full ? ' full' : ''}">
    <label for="field-${name}">${label}${required ? html`<span class="required" aria-hidden="true"> *</span>` : ''}</label>
    ${prefix ? html`<div class="input-affix"><span class="affix" data-affix aria-hidden="true">${prefix}</span>${input}</div>` : input}
    ${hint ? html`<small>${hint}</small>` : ''}
  </div>`;
}

export function textArea(label, name, value = '', {required = false, maxLength = 3000, hint = '', extra = '', attrs = ''} = {}) {
  return html`<div class="field full">
    <div class="label-row"><label for="field-${name}">${label}${required ? html`<span class="required" aria-hidden="true"> *</span>` : ''}</label>${extra}</div>
    <textarea id="field-${name}" name="${name}" maxlength="${maxLength}" ${required ? html`required` : ''} ${raw(attrs)}>${value ?? ''}</textarea>
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

// Large tap targets for a choice among a few options (claim kind, reply kind).
//   options: [[value, label, description?, iconName?]]
export function choiceCards(legend, name, options, selected, {columns = options.length} = {}) {
  return html`<fieldset class="choice-group full">
    <legend>${legend}</legend>
    <div class="choices cols-${columns}">
      ${options.map(([value, label, description, iconName]) => html`<label class="choice">
        <input type="radio" name="${name}" value="${value}" ${value === selected ? html`checked` : ''}>
        <span class="choice-body">${iconName ? icon(iconName) : ''}<strong>${label}</strong>${description ? html`<small>${description}</small>` : ''}</span>
      </label>`)}
    </div>
  </fieldset>`;
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

// Centred in its panel: title, one sentence, at most one next action.
// dori: show Dori standing with a document (still pose, no motion).
export function emptyState(title, body = '', {action = null, dori = false, compact = false} = {}) {
  return html`<div class="empty${compact ? ' compact' : ''}">
    ${dori ? doriFigure({pose: 'still', size: dori === 'sm' ? 'sm' : 'md'}) : ''}
    <h2>${title}</h2>
    ${body ? html`<p>${body}</p>` : ''}
    ${action ? html`<button class="btn primary" type="button" data-action="${action.name}">${action.label}</button>` : ''}
  </div>`;
}

// Placeholders shaped like the content they stand in for (DESIGN.md §9).
export const skeletonRows = (count = 3) => html`<div class="skeleton-rows" role="status" aria-label="불러오는 중…">
  ${Array.from({length: count}, () => html`<div class="skeleton-row"><span class="skeleton"></span><span class="skeleton short"></span><span class="skeleton short"></span></div>`)}
</div>`;

export const skeletonCards = (count = 3) => html`<div class="card-list" role="status" aria-label="불러오는 중…">
  ${Array.from({length: count}, () => html`<div class="claim-card is-skeleton"><span class="skeleton title"></span><span class="skeleton short"></span><span class="skeleton"></span></div>`)}
</div>`;

export const skeletonDetail = () => html`<div class="skeleton-rows" role="status" aria-label="불러오는 중…">
  <span class="skeleton short"></span><span class="skeleton title"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton short"></span>
</div>`;

// AI output and AI notes: violet, labelled, never mistaken for saved facts.
export const aiNote = text => html`<div class="ai-note">${icon('sparkle')}<div>${text}</div></div>`;
