import {AppError} from '../domain/errors.mjs';

// Used when no mail service is configured (the production default until one is
// chosen). The web app hides the password-reset link and the verification band.
export function createDisabledProvider() {
  return {
    name: 'disabled',
    enabled: false,
    async send() {
      throw new AppError(503, 'mail_disabled', '메일 발송이 아직 설정되지 않았어요. 운영자에게 문의하세요.');
    },
  };
}
