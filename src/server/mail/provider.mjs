import {createConsoleProvider} from './console.provider.mjs';
import {createDisabledProvider} from './disabled.provider.mjs';

// Provider contract (every implementation returns this shape):
//   name: string, enabled: boolean
//   send({to, subject, text}) -> Promise<void>
// Services never await delivery inside a request (see services/auth.service.mjs),
// so a slow or failing provider cannot reveal whether an account exists.
// Failures throw AppError with a mail_* code; never include the API key.
// A real provider (its API key in .env only) is added here once the service is chosen.
export function createMailProvider(mailConfig, {logger = console} = {}) {
  if (mailConfig.provider === 'console') return createConsoleProvider({logger});
  return createDisabledProvider();
}
