// Sends one test message through Resend to check the key and the sender.
//   1. Put RESEND_API_KEY (and MAIL_FROM on your verified domain) in .env
//   2. npm run mail:smoke -- you@example.com
// Without MAIL_FROM the sender is onboarding@resend.dev, which Resend delivers
// only to the address of your own Resend account. Never prints the key.
import {loadConfig} from '../src/server/config.mjs';
import {createResendProvider} from '../src/server/mail/resend.provider.mjs';

const to = process.argv[2] ?? '';
const config = loadConfig();
if (config.mail.provider !== 'resend') {
  console.error('RESEND_API_KEY가 설정되지 않았어요. 프로젝트 루트 .env에 RESEND_API_KEY=... 를 넣은 뒤 다시 실행하세요.');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('받을 주소를 함께 적어 주세요: npm run mail:smoke -- you@example.com');
  process.exit(1);
}

try {
  await createResendProvider(config.mail).send({
    to,
    subject: '[ReLo] 메일 발송 확인',
    text: 'ReLo 서버에서 Resend로 보낸 시험 메일이에요. 이 메일이 보이면 인증·비밀번호 재설정 메일도 같은 경로로 나가요.',
  });
  console.log(`✔ 보냈어요: ${config.mail.from} → ${to}`);
} catch (error) {
  console.log(`✖ ${error.code ?? 'error'}${error.detail ? ` (${error.detail})` : ''}: ${error.message}`);
  process.exitCode = 1;
}
