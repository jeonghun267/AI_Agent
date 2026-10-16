import {fixtureOrderPdf} from './fixtures.mjs';

// Development only (SEED_DEMO=1, default when APP_ENV=development).
// This password is public on purpose; never enable the seed in production.
export const DEMO_ACCOUNT = Object.freeze({email: 'demo@relo.test', password: 'Demo-Only-2026!', name: '데모 사용자'});

export async function seedDemo({services, repos}) {
  if (repos.users.existsByEmail(DEMO_ACCOUNT.email)) return;
  const user = await services.auth.register(DEMO_ACCOUNT);
  const claim = services.claims.create(user.id, {
    title: 'USB-C 허브 7-in-1',
    vendor: 'Example Gadgets EU',
    vendorUrl: '',
    orderRef: 'EG-2026-1001',
    orderedOn: '2026-10-01',
    kind: 'refund',
    currency: 'EUR',
    items: [{name: 'USB-C Hub 7-in-1', sku: '', orderedQty: 2, claimQty: 1, unitPrice: '39.90'}],
    claimedAmount: '39.90',
    agreedAmount: '',
    issue: '두 개 중 한 개가 전원이 들어오지 않습니다. 다른 노트북과 케이블로도 확인했습니다.',
    issueEnglish: '',
  }, 'seed-demo-claim-0001');
  services.files.upload(user.id, claim.id, claim.version, {
    name: 'order-EG-2026-1001.pdf', mime: 'application/pdf', bytes: fixtureOrderPdf(),
  }, 'seed-demo-file-0001');
}
