// Safe HTML templates. Every ${value} inside html`` is escaped unless it is
// itself an html`` result (or raw()). Arrays are joined. null/false render nothing.
const RAW = Symbol('raw-html');

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}

export function raw(markup) {
  return {[RAW]: true, markup: String(markup)};
}

function renderValue(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(renderValue).join('');
  if (value[RAW]) return value.markup;
  return esc(value);
}

export function html(strings, ...values) {
  let markup = strings[0];
  values.forEach((value, index) => { markup += renderValue(value) + strings[index + 1]; });
  return raw(markup);
}

export function toMarkup(template) {
  return renderValue(template);
}
