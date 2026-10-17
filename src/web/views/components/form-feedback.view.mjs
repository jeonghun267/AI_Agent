// Inline form errors (DESIGN.md §9): the message sits right under the input,
// the input gets aria-invalid, and the first wrong input receives focus.
// Server errors name the input in `field`; "items.0.unitPrice" maps to the
// claim form's "unitPrice-0".

function inputFor(form, field) {
  const item = /^items\.(\d+)\.(\w+)$/.exec(field ?? '');
  const element = form.elements.namedItem(item ? `${item[2]}-${item[1]}` : field ?? '');
  const input = element instanceof RadioNodeList ? element[0] : element;
  return input && input.type !== 'hidden' ? input : null;
}

// Korean messages for the browser's built-in checks, independent of browser language.
function messageFor(input) {
  const v = input.validity;
  if (v.valueMissing) return {checkbox: '확인 체크가 필요해요.', radio: '하나를 골라 주세요.'}[input.type] ?? '꼭 입력해야 하는 칸이에요.';
  if (v.typeMismatch) return input.type === 'email' ? '이메일 형식을 확인하세요. 예: you@example.com' : 'http:// 또는 https:// 로 시작하는 주소를 입력하세요.';
  if (v.tooShort) return `${input.minLength}자 이상 입력하세요.`;
  if (v.rangeUnderflow) return `${input.min} 이상으로 입력하세요.`;
  if (v.rangeOverflow) return `${input.max} 이하로 입력하세요.`;
  if (v.badInput || v.stepMismatch) return '숫자를 확인하세요.';
  return '입력한 값을 확인하세요.';
}

export function clearFieldError(input) {
  if (input.getAttribute('aria-invalid') !== 'true') return;
  input.removeAttribute('aria-invalid');
  document.getElementById(input.getAttribute('aria-describedby'))?.remove();
  input.removeAttribute('aria-describedby');
}

export function clearFieldErrors(form) {
  for (const input of form.querySelectorAll('[aria-invalid="true"]')) clearFieldError(input);
}

// Returns the input that now shows the message, or null if the form has no such input.
export function showFieldError(form, field, message) {
  const input = inputFor(form, field);
  if (!input) return null;
  clearFieldError(input);
  const id = `error-${form.id}-${input.name}`;
  const note = document.createElement('p');
  note.className = 'field-error';
  note.id = id;
  note.textContent = message;
  // The message goes under the visible control: the checkbox row, the group of
  // choice cards, or the input with its currency label.
  const anchor = input.closest('.check, .choices, .input-affix') ?? input;
  anchor.insertAdjacentElement('afterend', note);
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', id);
  return input;
}

// Runs the browser's checks without its pop-up bubbles. Returns the first wrong
// input. `scope` limits the check to part of the form (one step of a wizard).
export function validateForm(form, scope = form) {
  const inside = input => scope === form || scope.contains(input);
  for (const input of form.querySelectorAll('[aria-invalid="true"]')) if (inside(input)) clearFieldError(input);
  let first = null;
  for (const input of form.elements) {
    if (!inside(input) || !input.willValidate || input.checkValidity()) continue;
    showFieldError(form, input.name, messageFor(input));
    first ??= input;
  }
  return first;
}
