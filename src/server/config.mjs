import {resolve} from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ENVIRONMENTS = ['development', 'test', 'production'];
const AI_PROVIDERS = ['gemini', 'disabled', 'fake'];
// Only 'console' (development and tests) exists until a real mail service is chosen.
const MAIL_PROVIDERS = ['console', 'disabled'];
// Google's recommended cost-efficient model for new projects (checked 2026-10).
// Set GEMINI_MODEL=gemini-3.8-flash for higher quality at higher cost.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

function integer(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${name} must be a non-negative integer.`);
  return number;
}

// Reads every setting once at startup. Pass an object instead of process.env
// in tests. The returned object holds the API key: never log or serialize it.
export function loadConfig(env = process.env) {
  const appEnv = env.APP_ENV || 'development';
  if (!ENVIRONMENTS.includes(appEnv)) throw new Error(`APP_ENV must be one of: ${ENVIRONMENTS.join(', ')}.`);
  const isProduction = appEnv === 'production';

  const port = integer(env.PORT, 4180, 'PORT');
  const appOrigin = (env.APP_ORIGIN || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
  if (isProduction && !appOrigin.startsWith('https://')) throw new Error('APP_ORIGIN must be an https:// origin in production.');

  const apiKey = (env.GEMINI_API_KEY || '').trim();
  const provider = env.AI_PROVIDER || (apiKey ? 'gemini' : 'disabled');
  if (!AI_PROVIDERS.includes(provider)) throw new Error(`AI_PROVIDER must be one of: ${AI_PROVIDERS.join(', ')}.`);
  if (provider === 'fake' && isProduction) throw new Error('AI_PROVIDER=fake is for tests only.');
  if (provider === 'gemini' && !apiKey) throw new Error('AI_PROVIDER=gemini needs GEMINI_API_KEY.');

  const mailProvider = env.MAIL_PROVIDER || (isProduction ? 'disabled' : 'console');
  if (!MAIL_PROVIDERS.includes(mailProvider)) throw new Error(`MAIL_PROVIDER must be one of: ${MAIL_PROVIDERS.join(', ')}.`);
  if (mailProvider === 'console' && isProduction) throw new Error('MAIL_PROVIDER=console prints one-time links to the log; it is for development and tests only.');

  return Object.freeze({
    root: ROOT,
    webRoot: resolve(ROOT, 'src', 'web'),
    appEnv,
    isProduction,
    host: env.HOST || '127.0.0.1',
    port,
    appOrigin,
    dataDir: resolve(ROOT, env.DATA_DIR || '.relo-data'),
    seedDemo: env.SEED_DEMO ? env.SEED_DEMO === '1' : appEnv === 'development',
    sessionTtlSeconds: integer(env.SESSION_TTL_SECONDS, 7 * 24 * 60 * 60, 'SESSION_TTL_SECONDS'),
    verifyTokenTtlSeconds: integer(env.EMAIL_VERIFY_TTL_SECONDS, 24 * 60 * 60, 'EMAIL_VERIFY_TTL_SECONDS'),
    resetTokenTtlSeconds: integer(env.PASSWORD_RESET_TTL_SECONDS, 30 * 60, 'PASSWORD_RESET_TTL_SECONDS'),
    mail: Object.freeze({provider: mailProvider}),
    ai: Object.freeze({
      provider,
      apiKey,
      model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      hourlyLimit: integer(env.AI_HOURLY_LIMIT, 30, 'AI_HOURLY_LIMIT'),
      timeoutMs: integer(env.AI_TIMEOUT_MS, 30000, 'AI_TIMEOUT_MS'),
    }),
  });
}
