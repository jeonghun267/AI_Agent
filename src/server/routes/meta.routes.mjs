import {CURRENCIES} from '../domain/money.mjs';
import {CLAIM_KINDS, STATES, REPLY_KINDS, DEADLINE_ZONES} from '../domain/claim.mjs';
import {RECEIPT_KINDS} from '../domain/receipt.mjs';
import {ALLOWED_FILE_TYPES, MAX_FILE_BYTES} from '../services/file.service.mjs';
import {DEMO_ACCOUNT} from '../dev/seed.mjs';

// Public reference data, so the web app never hard-codes server rules.
export function registerMetaRoutes(router, {config, services}) {
  router.get('/api/health', () => ({body: {ok: true}}), {auth: false});

  router.get('/api/config', () => ({
    body: {
      environment: config.appEnv,
      currencies: CURRENCIES,
      claimKinds: CLAIM_KINDS,
      states: STATES,
      replyKinds: REPLY_KINDS,
      receiptKinds: RECEIPT_KINDS,
      deadlineZones: DEADLINE_ZONES,
      files: {types: ALLOWED_FILE_TYPES, maxBytes: MAX_FILE_BYTES},
      ai: services.ai.status(),
      ...(config.seedDemo ? {demoAccount: DEMO_ACCOUNT} : {}),
    },
  }), {auth: false});

  router.get('/api/me', ctx => ({
    body: {user: ctx.user, csrf: ctx.csrf, ai: {...services.ai.status(), consented: !!ctx.user.aiConsentAt}},
  }));
}
