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

test('sign up, record a claim with AI help and a receipt, then use it on a phone', {skip: !CHROME && 'Chrome not found (set RELO_CHROME_PATH)'}, async t => {
  const {base} = await startApp(t);
  const browser = await chromium.launch({executablePath: CHROME, headless: true});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 1280, height: 860}, locale: 'ko-KR', timezoneId: 'Asia/Seoul'});

  const external = [];
  await context.route('**/*', route => {
    const {hostname, href} = new URL(route.request().url());
    if (hostname !== '127.0.0.1') { external.push(href); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The signed-out /api/me check on first load is an expected 401.
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('401')) errors.push(message.text()); });
  const pill = () => page.locator('.detail-title .pill').textContent();

  // Sign up and land on the empty dashboard.
  await page.goto(base);
  await page.getByRole('link', {name: '회원가입'}).click();
  await page.fill('#field-email', 'browser@example.test');
  await page.fill('#field-password', PASSWORD);
  await page.fill('#field-passwordConfirm', PASSWORD);
  await page.click('#signup-form [type="submit"]');
  await page.getByRole('heading', {name: '아직 등록한 클레임이 없어요'}).waitFor();

  // Create a EUR claim.
  await page.getByRole('button', {name: '첫 클레임 만들기'}).click();
  await page.fill('#field-title', 'USB-C 허브');
  await page.fill('#field-vendor', 'Example Gadgets EU');
  await page.fill('#field-orderRef', 'EG-BROWSER-1');
  await page.selectOption('#field-currency', 'EUR');
  await page.fill('#field-claimedAmount', '39.90');
  await page.fill('#field-agreedAmount', '39.90');
  await page.fill('#field-issue', '두 개 중 한 개가 켜지지 않습니다.');
  await page.fill('#field-name-0', 'USB-C Hub');
  await page.fill('#field-orderedQty-0', '2');
  await page.fill('#field-unitPrice-0', '39.90');
  await page.click('#claim-form [type="submit"]');
  await page.waitForURL(/#\/claims\/[\w-]+\/files$/);

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

  // A real partial refund, which survives a reload.
  await page.click('.tabs a[href$="/ledger"]');
  await page.click('[data-action="record-receipt"]');
  await page.fill('#field-amount', '20.00');
  await page.fill('#field-transactionRef', 'BANK-BROWSER-1');
  await page.check('#receipt-form [name="confirmed"]');
  await page.click('#receipt-form [type="submit"]');
  await page.waitForFunction(() => document.querySelector('.detail-title .pill')?.textContent === '부분 회수');
  const ledgerUrl = page.url();
  await page.reload();
  await page.locator('.detail-title .pill').waitFor();
  assert.equal(page.url(), ledgerUrl, 'reload keeps the same claim tab');
  assert.equal(await pill(), '부분 회수');

  // Phone: no sideways scrolling, bottom tab bar, dialogs open as bottom sheets.
  await page.setViewportSize({width: 375, height: 812});
  await page.goto(`${base}/#/`);
  await page.reload();
  await page.locator('.summary').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
  assert.equal(await page.locator('.nav').evaluate(nav => getComputedStyle(nav).position), 'fixed');
  await page.click('[data-action="new-claim"]');
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
  await page.getByRole('button', {name: '첫 클레임 만들기'}).click();

  // 1) Empty submit: Korean messages under the inputs, focus on the first one, nothing sent.
  await page.click('#claim-form [type="submit"]');
  await page.locator('#error-claim-form-title').waitFor();
  assert.equal(await page.locator('#error-claim-form-title').textContent(), '꼭 입력해야 하는 칸이에요.');
  assert.equal(await focusedName(), 'title');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM claims').get().n, 0);

  // 2) A server-side rule names the input; its message appears under that input.
  await page.fill('#field-title', 'USB-C 허브');
  assert.equal(await page.locator('#error-claim-form-title').count(), 0, 'typing clears the error');
  await page.fill('#field-vendor', 'Example Gadgets EU');
  await page.fill('#field-orderRef', 'EG-FEEDBACK-1');
  await page.fill('#field-claimedAmount', '1.001');
  await page.fill('#field-issue', '두 개 중 한 개가 켜지지 않습니다.');
  await page.fill('#field-name-0', 'USB-C Hub');
  await page.fill('#field-unitPrice-0', '39.90');
  await page.click('#claim-form [type="submit"]');
  await page.locator('#error-claim-form-claimedAmount').waitFor();
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
