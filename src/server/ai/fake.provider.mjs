// Deterministic provider for tests and offline development (AI_PROVIDER=fake).
// Pass responders to override one capability, e.g. to return bad output.
const DEFAULT_RESPONDERS = {
  draft: () => ({
    subject: 'Request for a refund - Order EG-2026-1001',
    body: 'Hello Support,\n\nOne of the two USB-C hubs from order EG-2026-1001 does not power on. I would like to request a refund for the defective unit. Please let me know which evidence you need.\n\nThank you,\n[이름]',
    summaryKo: '불량 1개에 대한 환불을 요청하고 필요한 증빙을 묻는 메일입니다.',
    missingInfo: ['보내는 사람 이름'],
  }),
  'translate-issue': () => ({english: 'One of the two units does not power on.'}),
  'analyze-reply': () => ({
    translationKo: '불량 제품 사진을 보내 주시면 환불을 진행하겠습니다.',
    summaryKo: '판매처가 불량 사진을 요청했어요. 사진을 보내면 환불을 진행한다고 합니다.',
    suggestedKind: 'evidence',
    mentionedAmount: null,
    mentionedCurrency: null,
    deadline: null,
    deadlineQuote: null,
  }),
  extract: () => ({
    vendor: 'Example Gadgets EU',
    orderRef: 'EG-2026-1001',
    orderedOn: '2026-10-01',
    currency: 'EUR',
    total: '79.80',
    items: [{name: 'USB-C Hub 7-in-1', quantity: 2, unitPrice: '39.90'}],
    fields: [
      {field: 'vendor', value: 'Example Gadgets EU', quote: 'Seller: Example Gadgets EU'},
      {field: 'orderRef', value: 'EG-2026-1001', quote: 'Order: EG-2026-1001'},
      {field: 'total', value: '79.80', quote: 'Total: EUR 79.80'},
    ],
  }),
};

export function createFakeProvider(responders = {}) {
  const all = {...DEFAULT_RESPONDERS, ...responders};
  return {
    name: 'fake',
    model: 'fake-model',
    enabled: true,
    calls: [],
    async generateJson(request) {
      this.calls.push(request);
      return {data: await all[request.capability](request), model: 'fake-model', usage: {inputTokens: 10, outputTokens: 20}};
    },
  };
}
