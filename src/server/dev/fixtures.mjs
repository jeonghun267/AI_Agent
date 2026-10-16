// Synthetic order document used by the development seed, tests and the AI
// smoke check. Plain-text PDF so extraction results are easy to verify.
export const FIXTURE_ORDER_TEXT = [
  'SYNTHETIC DOCUMENT ONLY',
  'Seller: Example Gadgets EU',
  'Order: EG-2026-1001',
  'Order date: 2026-10-01',
  'Item: USB-C Hub 7-in-1   Qty: 2   Unit price: EUR 39.90',
  'Total: EUR 79.80',
  'Problem: 1 unit does not power on',
].join('\n');

const escapePdfText = text => text.replace(/[\\()]/g, char => '\\' + char);

export function fixtureOrderPdf() {
  const lines = FIXTURE_ORDER_TEXT.split('\n');
  const content = 'BT /F1 12 Tf 50 750 Td '
    + lines.map((line, index) => (index ? '0 -22 Td ' : '') + `(${escapePdfText(line)}) Tj`).join('\n')
    + ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')
    + `\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf);
}
