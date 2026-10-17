import {html} from '../../core/html.mjs';
import {icon} from './icons.view.mjs';
import {validateForm} from './form-feedback.view.mjs';

// Step-by-step forms (DESIGN.md §7 "단계 진행"). One <form data-wizard> holds
// every step as <section data-step="n">, so typed input survives moving back
// and forth and the normal submit, inline errors and unsaved-input guard keep
// working. Only the current step is shown. Moving forward checks that step.

// Header: numbered steps; finished ones can be revisited with a click.
export function stepperHeader(labels) {
  return html`<ol class="stepper" aria-label="신청 단계">
    ${labels.map((label, index) => html`<li data-step-tab="${index + 1}" class="${index ? '' : 'is-current'}" ${index ? '' : html`aria-current="step"`}>
      <button type="button" data-action="wizard-go" data-step="${index + 1}" ${index ? html`disabled` : ''}>
        <span class="stepper-dot"><span class="stepper-num">${index + 1}</span>${icon('check', {className: 'stepper-check'})}</span>
        <span class="stepper-label">${label}</span>
      </button>
    </li>`)}
  </ol>
  <p class="visually-hidden" data-step-status aria-live="polite"></p>`;
}

// Footer: 이전 · 다음, and the real submit button on the last step.
export function stepperActions(submitLabel) {
  return html`<p class="error" role="alert"></p>
  <div class="form-actions wizard-actions">
    <button class="btn" type="button" data-action="wizard-prev" hidden>${icon('back')}이전</button>
    <button class="btn primary" type="button" data-action="wizard-next">다음${icon('arrow')}</button>
    <button class="btn primary" type="submit" hidden>${submitLabel}</button>
  </div>`;
}

const enterHooks = new Map();

// Lets a form refresh a step when it is shown (e.g. the review summary).
export function onStepEnter(formId, hook) {
  enterHooks.set(formId, hook);
}

const sections = form => [...form.querySelectorAll('section[data-step]')];
export const currentStep = form => Number(form.dataset.step || 1);

export function showStep(form, step, {focus = true} = {}) {
  const all = sections(form);
  const count = all.length;
  const reached = Math.max(Number(form.dataset.reached || 1), step);
  form.dataset.step = String(step);
  form.dataset.reached = String(reached);
  for (const section of all) section.hidden = Number(section.dataset.step) !== step;
  for (const tab of form.querySelectorAll('[data-step-tab]')) {
    const n = Number(tab.dataset.stepTab);
    tab.classList.toggle('is-current', n === step);
    tab.classList.toggle('is-done', n < step || (n <= reached && n !== step));
    if (n === step) tab.setAttribute('aria-current', 'step');
    else tab.removeAttribute('aria-current');
    tab.querySelector('button').disabled = n > reached || n === step;
  }
  const last = step === count;
  form.querySelector('[data-action="wizard-prev"]').hidden = step === 1;
  form.querySelector('[data-action="wizard-next"]').hidden = last;
  form.querySelector('.wizard-actions [type="submit"]').hidden = !last;
  const title = form.querySelector(`section[data-step="${step}"] .step-title`);
  const status = form.querySelector('[data-step-status]');
  if (status) status.textContent = `${count}단계 중 ${step}단계: ${title?.textContent ?? ''}`;
  enterHooks.get(form.id)?.(form, step);
  form.closest('dialog')?.scrollTo({top: 0});
  if (focus) title?.focus({preventScroll: true});
}

// Checks the current step; on success shows the next one.
export function nextStep(form) {
  const step = currentStep(form);
  const invalid = validateForm(form, form.querySelector(`section[data-step="${step}"]`));
  if (invalid) {
    invalid.focus();
    return false;
  }
  showStep(form, Math.min(step + 1, sections(form).length));
  return true;
}

// Enter in a field submits the form; before the last step that means "다음".
export function interceptSubmit(form) {
  if (!form.hasAttribute('data-wizard') || currentStep(form) >= sections(form).length) return false;
  nextStep(form);
  return true;
}

// Makes an input visible before it gets focus and an error: switches to its
// step and opens any closed <details> around it.
export function revealField(input) {
  const section = input.closest('section[data-step]');
  if (section?.hidden && input.form) showStep(input.form, Number(section.dataset.step), {focus: false});
  for (let details = input.closest('details:not([open])'); details; details = details.parentElement?.closest('details:not([open])')) details.open = true;
}

export const handlers = {
  click: {
    'wizard-next': ({el}) => { nextStep(el.form); },
    'wizard-prev': ({el}) => showStep(el.form, Math.max(1, currentStep(el.form) - 1)),
    'wizard-go': ({el}) => showStep(el.closest('form'), Number(el.dataset.step)),
  },
};
