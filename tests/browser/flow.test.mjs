// End-to-end flow in the installed Chrome (headless, fresh profile, fake AI).
// Set RELO_CHROME_PATH if Chrome is not in a standard location.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {startApp, PASSWORD} from '../helpers/app.mjs';
import {fixtureOrderPdf} from '../../src/server/dev/fixtures.mjs';

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
