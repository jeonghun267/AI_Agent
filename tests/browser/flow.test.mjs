// End-to-end flow in the installed Chrome (headless, fresh profile, fake AI).
// Set RELO_CHROME_PATH if Chrome is not in a standard location.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';
import {startApp, PASSWORD} from '../helpers/app.mjs';
import {fixtureOrderPdf} from '../../src/server/dev/fixtures.mjs';
import {createFakeProvider} from '../../src/server/ai/fake.provider.mjs';

const CHROME = [
  process.env.RELO_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(path => path && existsSync(path));
const NO_CHROME = !CHROME && 'Chrome not found (set RELO_CHROME_PATH)';

// Desktop page in a fresh profile. Collects script errors; the signed-out
// /api/me check and wrong-password attempts are expected 401s.
async function openPage(t) {
  const browser = await chromium.launch({executablePath: CHROME, headless: true});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 1280, height: 860}, locale: 'ko-KR', timezoneId: 'Asia/Seoul'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('401')) errors.push(message.text()); });
  return {context, page, errors};
}

test('sign up, record a claim with AI help and a receipt, then use it on a phone', {skip: NO_CHROME}, async t => {
  const {base} = await startApp(t);
  const {context, page, errors} = await openPage(t);

  const external = [];
  await context.route('**/*', route => {
    const {hostname, href} = new URL(route.request().url());
    if (hostname !== '127.0.0.1') { external.push(href); return route.abort(); }
    return route.continue();
  });
  const pill = () => page.locator('.detail-title .pill').textContent();

  // Sign up and land on the empty dashboard.
  await page.goto(base);
  await page.getByRole('link', {name: '회원가입'}).click();
  await page.fill('#field-email', 'browser@example.test');
  await page.fill('#field-password', PASSWORD);
  await page.fill('#field-passwordConfirm', PASSWORD);
  await page.click('#signup-form [type="submit"]');
  await page.getByRole('heading', {name: '아직 등록한 클레임이 없어요'}).waitFor();

  // Create a EUR claim in five steps: basics, money, problem, evidence (skipped), review.
  const next = () => page.click('#claim-form [data-action="wizard-next"]');
  await page.getByRole('button', {name: '첫 클레임 등록하기'}).click();
  await page.fill('#field-vendor', 'Example Gadgets EU');
  await page.fill('#field-orderRef', 'EG-BROWSER-1');
  await page.fill('#field-title', 'USB-C 허브');
  await next();
  await page.selectOption('#field-currency', 'EUR');
  await page.fill('#field-name-0', 'USB-C Hub');
  await page.fill('#field-orderedQty-0', '2');
  await page.fill('#field-unitPrice-0', '39.90');
  // The problem items' total is offered as the claim amount.
  await page.getByRole('button', {name: '청구액으로 쓰기'}).click();
  assert.equal(await page.inputValue('#field-claimedAmount'), '39.90');
  await page.fill('#field-agreedAmount', '39.90');
  await next();
  await page.fill('#field-issue', '두 개 중 한 개가 켜지지 않습니다.');
  await next();
  await next();
  assert.match(await page.locator('#wizard-review').textContent(), /Example Gadgets EU[\s\S]*€39\.90/);
  await page.click('#claim-form [type="submit"]');
  await page.waitForURL(/#\/claims\/[\w-]+\/files$/);
  assert.equal(await page.locator('.next-card h2').textContent(), '증빙부터 올려 주세요');

  // Upload evidence, then read it with AI after giving consent.
  await page.setInputFiles('#upload-file', {name: 'order.pdf', mimeType: 'application/pdf', buffer: fixtureOrderPdf()});
  await page.locator('.file-card').waitFor();
  await page.getByRole('button', {name: 'AI로 주문 정보 읽기'}).click();
  await page.getByRole('button', {name: '동의하고 계속'}).click();
  await page.getByRole('heading', {name: 'AI가 읽은 주문 정보'}).waitFor();
  await page.locator('#modal .form-actions [data-action="close-dialog"]').click();

  // AI draft (Dori shows for at least 2.5s), save, record that it was sent.
  await page.click('.tabs a[href$="/inquiry"]');
  await page.click('[data-action="prepare-draft"][data-ai="1"]');
  await page.locator('#modal .dori-loading').waitFor();
  await page.locator('#draft-form').waitFor({timeout: 10000});
  await page.click('#draft-form [type="submit"]');
  await page.click('[data-action="submit-draft"]');
  await page.check('#submit-draft-form [name="confirmed"]');
  await page.click('#submit-draft-form [type="submit"]');
  await page.waitForFunction(() => document.querySelector('.detail-title .pill')?.textContent === '판매처 답변 대기');
  assert.equal(await page.locator('.next-card h2').textContent(), '판매처 답변을 기다리고 있어요');

  // A real partial refund, which survives a reload. The dialog shows the change before saving.
  await page.click('.tabs a[href$="/ledger"]');
  await page.click('[data-action="record-receipt"]');
  await page.fill('#field-amount', '20.00');
  assert.match(await page.locator('.receipt-preview').textContent(), /€0\.00[\s\S]*€20\.00[\s\S]*0%[\s\S]*50%/);
  await page.fill('#field-transactionRef', 'BANK-BROWSER-1');
  await page.check('#receipt-form [name="confirmed"]');
  await page.click('#receipt-form [type="submit"]');
  await page.waitForFunction(() => document.querySelector('.detail-title .pill')?.textContent === '부분 회수');
  const ledgerUrl = page.url();
  await page.reload();
  await page.locator('.detail-title .pill').waitFor();
  assert.equal(page.url(), ledgerUrl, 'reload keeps the same claim tab');
  assert.equal(await pill(), '부분 회수');
  // Progress line and meter: 회수 is the current step, €20.00 of €39.90 is 50%.
  assert.equal(await page.locator('.step[aria-current="step"] .step-label').textContent(), '회수');
  assert.equal(await page.locator('.money-card .meter-percent').textContent(), '50%');

  // Receiving the rest (from the next-action card) celebrates once with Dori.
  assert.equal(await page.locator('.next-card h2').textContent(), '남은 금액을 기다리고 있어요');
  await page.click('.next-card [data-action="record-receipt"]');
  await page.fill('#field-amount', '19.90');
  await page.fill('#field-transactionRef', 'BANK-BROWSER-2');
  await page.check('#receipt-form [name="confirmed"]');
  await page.click('#receipt-form [type="submit"]');
  await page.getByRole('heading', {name: '전액 회수가 완료됐어요'}).waitFor();
  assert.equal(await page.locator('#modal .dori-figure-wrap.is-celebrating').count(), 1);
  await page.getByRole('button', {name: '상세로 돌아가기'}).click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  assert.equal(await page.locator('.money-card .meter-percent').textContent(), '100%');

  // Phone: no sideways scrolling, bottom tab bar, home lists the next step,
  // and the new-claim flow takes the whole screen.
  await page.setViewportSize({width: 375, height: 812});
  await page.goto(`${base}/#/`);
  await page.reload();
  await page.locator('.kpis').waitFor();
  assert.equal(await page.locator('.todo-item h3').first().textContent(), '모두 돌려받았어요');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
  assert.equal(await page.locator('.nav').evaluate(nav => getComputedStyle(nav).position), 'fixed');
  await page.click('.nav [data-action="new-claim"]');
  await page.locator('#claim-form').waitFor();
  await page.waitForTimeout(400);
  const sheet = await page.locator('#modal').boundingBox();
  assert.equal(Math.round(sheet.y + sheet.height), 812, 'sheet is attached to the bottom edge');

  assert.deepEqual(external, [], 'no requests leave the machine');
  assert.deepEqual(errors, [], 'no script errors');
});

test('errors appear under the input, unsaved input is protected, slow AI shows progress and can be cancelled', {skip: !CHROME && 'Chrome not found (set RELO_CHROME_PATH)'}, async t => {
  // Translation answers after 2.5s so the waiting state is visible.
  const aiProvider = createFakeProvider({'translate-issue': async () => { await delay(2500); return {english: 'Late answer'}; }});
  const {base, app} = await startApp(t, {aiProvider});
  const browser = await chromium.launch({executablePath: CHROME, headless: true});
  t.after(() => browser.close());
  const page = await (await browser.newContext({viewport: {width: 1280, height: 860}, locale: 'ko-KR'})).newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const focusedName = () => page.evaluate(() => document.activeElement?.name);

  await page.goto(`${base}/#/signup`);
  await page.fill('#field-email', 'feedback@example.test');
  await page.fill('#field-password', PASSWORD);
  await page.fill('#field-passwordConfirm', PASSWORD);
  await page.click('#signup-form [type="submit"]');
  await page.getByRole('button', {name: '첫 클레임 등록하기'}).click();
  const next = () => page.click('#claim-form [data-action="wizard-next"]');
  const step = () => page.locator('#claim-form').getAttribute('data-step');

  // 1) "다음" on an empty step: Korean messages under its inputs, focus on the first one, nothing sent.
  await next();
  await page.locator('#error-claim-form-title').waitFor();
  assert.equal(await page.locator('#error-claim-form-title').textContent(), '꼭 입력해야 하는 칸이에요.');
  assert.equal(await focusedName(), 'vendor');
  assert.equal(await step(), '1', 'the step does not change while it has errors');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM claims').get().n, 0);

  // 2) A server-side rule names the input; the form goes back to its step and shows the message there.
  await page.fill('#field-title', 'USB-C 허브');
  assert.equal(await page.locator('#error-claim-form-title').count(), 0, 'typing clears the error');
  await page.fill('#field-vendor', 'Example Gadgets EU');
  await page.fill('#field-orderRef', 'EG-FEEDBACK-1');
  await next();
  await page.fill('#field-name-0', 'USB-C Hub');
  await page.fill('#field-unitPrice-0', '39.90');
  await page.fill('#field-claimedAmount', '1.001');
  await next();
  await page.fill('#field-issue', '두 개 중 한 개가 켜지지 않습니다.');
  await page.keyboard.press('Enter');
  assert.equal(await step(), '3', 'Enter in a textarea adds a line, it does not move on');
  await page.click('#claim-form [data-action="wizard-prev"]');
  await page.locator('#field-claimedAmount').press('Enter');
  assert.equal(await step(), '3', 'Enter in an input means "다음" before the last step');
  await next();
  await next();
  await page.click('#claim-form [type="submit"]');
  await page.locator('#error-claim-form-claimedAmount').waitFor();
  assert.equal(await step(), '2');
  assert.match(await page.locator('#error-claim-form-claimedAmount').textContent(), /소수점/);
  assert.equal(await focusedName(), 'claimedAmount');
  await page.fill('#field-claimedAmount', '39.90');

  // 3) Esc with unsaved input asks first; "계속 작성" keeps everything.
  await page.keyboard.press('Escape');
  await page.getByRole('heading', {name: '작성 중인 내용이 있어요'}).waitFor();
  await page.getByRole('button', {name: '계속 작성'}).click();
  assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), true);
  assert.equal(await page.inputValue('#field-title'), 'USB-C 허브');

  // 4) Slow AI: progress row with a seconds counter, then cancel; the late answer is ignored.
  await next();
  await page.getByRole('button', {name: 'AI로 영문 작성'}).click();
  await page.getByRole('button', {name: '동의하고 계속'}).click();
  const progress = page.locator('#modal [data-ai-slot="translate"] .ai-progress');
  await progress.waitFor();
  assert.match(await progress.textContent(), /AI가 영문 설명을 쓰는 중…/);
  await page.waitForFunction(() => /[1-9]초/.test(document.querySelector('[data-ai-elapsed]')?.textContent ?? ''));
  await progress.getByRole('button', {name: '취소'}).click();
  await progress.waitFor({state: 'detached'});
  assert.equal(await page.locator('#modal #toast').textContent(), 'AI 작업을 취소했어요.', 'the toast shows inside the open dialog');
  await page.waitForTimeout(2600);
  assert.equal(await page.inputValue('#field-issueEnglish'), '');

  // 5) Closing anyway: confirm, then the dialog is gone and nothing was saved.
  await page.click('#modal .modal-head [data-action="close-dialog"]');
  await page.getByRole('button', {name: '버리고 닫기'}).click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM claims').get().n, 0);
  assert.deepEqual(errors, []);
});

test('confirm the address from the emailed link, then reset a forgotten password', {skip: NO_CHROME}, async t => {
  const {base, mail} = await startApp(t);
  const {page, errors} = await openPage(t);
  const email = 'reset-flow@example.test';
  const newPassword = 'Brand-New-Pass-2026';
  const band = page.locator('.verify-band');
  const hash = () => page.evaluate(() => location.hash);

  // A new account is signed in, with a band asking to confirm the address.
  await page.goto(`${base}/#/signup`);
  await page.fill('#field-email', email);
  await page.fill('#field-password', PASSWORD);
  await page.fill('#field-passwordConfirm', PASSWORD);
  await page.click('#signup-form [type="submit"]');
  await band.waitFor();
  await band.getByRole('button', {name: '인증 메일 다시 받기'}).click();
  await page.locator('#toast.show').filter({hasText: '인증 메일을 다시 보냈어요'}).waitFor();
  assert.equal(mail.count(email, 'verify'), 2);
  await page.setViewportSize({width: 375, height: 812});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the band fits a phone');
  await page.setViewportSize({width: 1280, height: 860});

  // The emailed link confirms it; the token does not stay in the address bar.
  await page.goto(`${base}/#/verify/${mail.token(email, 'verify')}`);
  await page.locator('#toast.show').filter({hasText: '이메일 인증을 마쳤어요'}).waitFor();
  await band.waitFor({state: 'detached'});
  assert.equal(await hash(), '#/');

  // Forgotten password: sign out, ask for a link, choose a new password.
  await page.click('[data-action="logout"]');
  await page.getByRole('link', {name: '비밀번호를 잊었어요'}).click();
  await page.fill('#field-email', email);
  await page.click('#forgot-form [type="submit"]');
  await page.getByRole('heading', {name: '메일함을 확인하세요'}).waitFor();
  await page.goto(`${base}/#/reset/${mail.token(email, 'reset')}`);
  await page.getByRole('heading', {name: '새 비밀번호 정하기'}).waitFor();
  await page.fill('#field-password', newPassword);
  await page.fill('#field-passwordConfirm', newPassword);
  await page.click('#reset-form [type="submit"]');
  await page.locator('#toast.show').filter({hasText: '비밀번호를 바꿨어요'}).waitFor();
  await page.locator('#login-form').waitFor();
  assert.equal(await hash(), '#/login', 'the used link is replaced in history');

  // The old password stops working; the new one signs in.
  await page.fill('#field-email', email);
  await page.fill('#field-password', PASSWORD);
  await page.click('#login-form [type="submit"]');
  await page.locator('#login-form .error').filter({hasText: '이메일 또는 비밀번호'}).waitFor();
  await page.fill('#field-password', newPassword);
  await page.click('#login-form [type="submit"]');
  await page.getByRole('heading', {name: '아직 등록한 클레임이 없어요'}).waitFor();
  assert.equal(await band.count(), 0);

  // Opening the same reset link again is refused with a way forward.
  await page.click('[data-action="logout"]');
  await page.locator('#login-form').waitFor();
  await page.goto(`${base}/#/reset/${mail.token(email, 'reset')}`);
  await page.fill('#field-password', 'Another-Pass-2026');
  await page.fill('#field-passwordConfirm', 'Another-Pass-2026');
  await page.click('#reset-form [type="submit"]');
  await page.locator('#reset-form .error').filter({hasText: '만료됐거나 이미 사용됐어요'}).waitFor();
  assert.deepEqual(errors.filter(text => !text.includes('400')), [], 'no script errors');
});
