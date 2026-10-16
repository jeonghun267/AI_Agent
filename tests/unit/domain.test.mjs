import test from 'node:test';
import assert from 'node:assert/strict';
import {AppError} from '../../src/server/domain/errors.mjs';
import {parseMoney, toDecimal} from '../../src/server/domain/money.mjs';
import {parseClaimInput, totals, isRecovered, nextStateForTransition, stateAfterReceipt} from '../../src/server/domain/claim.mjs';
import {parseReceipt} from '../../src/server/domain/receipt.mjs';
import {templateDraft} from '../../src/server/domain/draft-template.mjs';
import {parsePastDate} from '../../src/server/domain/validation.mjs';

const rejects = (fn, code = 'validation') => assert.throws(fn, error => error instanceof AppError && error.code === code);

const claimInput = (patch = {}) => ({
  title: 'USB-C 허브', vendor: 'Example Gadgets EU', orderRef: 'EG-1', orderedOn: '2026-10-01',
  kind: 'refund', currency: 'EUR', claimedAmount: '39.90', agreedAmount: '',
  issue: '전원이 켜지지 않습니다.', items: [{name: 'USB-C Hub', orderedQty: 2, claimQty: 1, unitPrice: '39.90'}],
  ...patch,
});

test('money: minor units follow each currency', () => {
  assert.equal(parseMoney('12.3', 'USD'), 1230);
  assert.equal(parseMoney('1,500,000', 'KRW'), 1500000);
  assert.equal(parseMoney('1500', 'JPY'), 1500);
  assert.equal(toDecimal(1230, 'USD'), '12.30');
  assert.equal(toDecimal(1500, 'JPY'), '1500');
  rejects(() => parseMoney('12.345', 'USD'));
  rejects(() => parseMoney('1500.5', 'JPY'));
  rejects(() => parseMoney('-1', 'EUR'));
  rejects(() => parseMoney('10', 'XYZ'));
});

test('claim input: vendor, currency and amounts are validated', () => {
  const claim = parseClaimInput(claimInput());
  assert.equal(claim.vendor, 'Example Gadgets EU');
  assert.equal(claim.claimed, 3990);
  assert.equal(claim.agreed, null);
  assert.equal(claim.items[0].sku, '');
  rejects(() => parseClaimInput(claimInput({vendor: ''})));
  rejects(() => parseClaimInput(claimInput({currency: 'BTC'})));
  rejects(() => parseClaimInput(claimInput({agreedAmount: '50.00'})));
  rejects(() => parseClaimInput(claimInput({orderedOn: '2999-01-01'})));
  rejects(() => parseClaimInput(claimInput({items: [{name: 'x', orderedQty: 1, claimQty: 2, unitPrice: '1'}]})));
  rejects(() => parseClaimInput(claimInput({deadline: '2026-11-01'})));
  rejects(() => parseClaimInput(claimInput({vendorUrl: 'javascript:alert(1)'})));
});

test('validation errors name the input they belong to', () => {
  const fieldOf = fn => { try { fn(); } catch (error) { return error.field; } return null; };
  assert.equal(fieldOf(() => parseClaimInput(claimInput({vendor: ''}))), 'vendor');
  assert.equal(fieldOf(() => parseClaimInput(claimInput({claimedAmount: '1.001'}))), 'claimedAmount');
  assert.equal(fieldOf(() => parseClaimInput(claimInput({agreedAmount: '50.00'}))), 'agreedAmount');
  assert.equal(fieldOf(() => parseClaimInput(claimInput({items: [{name: 'x', orderedQty: 1, claimQty: 1, unitPrice: '1.234'}]}))), 'items.0.unitPrice');
  assert.equal(fieldOf(() => parseClaimInput(claimInput({deadline: '2026-11-01'}))), 'deadlineQuote');
  const agreed = parseClaimInput(claimInput({agreedAmount: '39.90'}));
  const receipt = {kind: 'cash', amount: '10.00', receivedOn: '2026-10-05', confirmed: true, transactionRef: 'bank-1'};
  assert.equal(fieldOf(() => parseReceipt(agreed, totals(agreed, []), [], {...receipt, amount: '99.00'})), 'amount');
  assert.equal(fieldOf(() => parseReceipt(agreed, totals(agreed, []), [], {...receipt, transactionRef: ''})), 'transactionRef');
  assert.equal(fieldOf(() => parseReceipt(agreed, totals(agreed, []), [], {...receipt, confirmed: false})), 'confirmed');
});

test('dates: "today" in a time zone ahead of UTC is not treated as the future', () => {
  const day = offsetHours => new Date(Date.now() + offsetHours * 3600 * 1000).toISOString().slice(0, 10);
  assert.equal(parsePastDate(day(9)), day(9), 'Korea (UTC+9) today');
  rejects(() => parsePastDate(day(48)));
});

test('totals: reversals undo entries and recovery depends on claim kind', () => {
  const refund = parseClaimInput(claimInput({agreedAmount: '39.90'}));
  const ledger = [{id: 'a', kind: 'cash', amount: 3990, quantity: 0}, {id: 'b', kind: 'reversal', amount: 3990, quantity: 0, reverses: 'a'}];
  assert.deepEqual(totals(refund, ledger), {cash: 0, goods: 0, repair: false, remaining: 3990, requestedQty: 1});
  assert.equal(isRecovered(refund, totals(refund, ledger.slice(0, 1))), true);

  const exchange = parseClaimInput(claimInput({kind: 'exchange'}));
  assert.equal(isRecovered(exchange, totals(exchange, [{id: 'g', kind: 'goods', amount: 0, quantity: 1}])), true);
  const repair = parseClaimInput(claimInput({kind: 'repair'}));
  const repaired = [{id: 'r', kind: 'repair', amount: 0, quantity: 0}];
  assert.equal(isRecovered(repair, totals(repair, repaired)), true);
  assert.equal(isRecovered(repair, totals(repair, [...repaired, {id: 'x', kind: 'reversal', amount: 0, quantity: 0, reverses: 'r'}])), false);
  assert.equal(stateAfterReceipt('disputed', refund, totals(refund, ledger.slice(0, 1))), 'disputed');
});

test('receipts: cash needs an agreement, a reference or explicit checks, and stays within the remainder', () => {
  const open = parseClaimInput(claimInput());
  const base = {kind: 'cash', amount: '10.00', receivedOn: '2026-10-05', confirmed: true, transactionRef: 'bank-1'};
  rejects(() => parseReceipt(open, totals(open, []), [], base));

  const agreed = parseClaimInput(claimInput({agreedAmount: '39.90'}));
  const summary = totals(agreed, []);
  assert.equal(parseReceipt(agreed, summary, [], base).transactionRef, 'BANK-1');
  rejects(() => parseReceipt(agreed, summary, [], {...base, confirmed: false}));
  rejects(() => parseReceipt(agreed, summary, [], {...base, amount: '40.00'}));
  rejects(() => parseReceipt(agreed, summary, [], {...base, transactionRef: ''}));
  const unreferenced = {...base, transactionRef: '', missingReferenceConfirmed: true, duplicateReviewed: true, note: '카드 명세서에서 확인함'};
  assert.equal(parseReceipt(agreed, summary, [], unreferenced).amount, 1000);
  const ledger = [{id: 'c', kind: 'cash', amount: 1000, quantity: 0, receivedOn: '2026-10-05'}];
  rejects(() => parseReceipt(agreed, totals(agreed, ledger), ledger, unreferenced), 'duplicate_suspected');
  const reversal = parseReceipt(agreed, totals(agreed, ledger), ledger, {kind: 'reversal', reverses: 'c', receivedOn: '2026-10-06', confirmed: true, note: '중복 기록'});
  assert.equal(reversal.amount, 1000);
});

test('transitions: closing needs real recovery, closed claims must reopen first', () => {
  const claim = parseClaimInput(claimInput({agreedAmount: '39.90'}));
  const none = totals(claim, []);
  rejects(() => nextStateForTransition('close', claim, 'negotiating', none));
  assert.equal(nextStateForTransition('close', claim, 'recovered', totals(claim, [{id: 'a', kind: 'cash', amount: 3990, quantity: 0}])), 'completed');
  rejects(() => nextStateForTransition('disputed', claim, 'waived', none));
  assert.equal(nextStateForTransition('reopen', claim, 'waived', none), 'negotiating');
  rejects(() => nextStateForTransition('bogus', claim, 'preparing', none));
});

test('template draft restates saved facts in the claim currency', () => {
  const draft = templateDraft(parseClaimInput(claimInput({currency: 'JPY', claimedAmount: '4500', items: [{name: 'Hub', orderedQty: 1, claimQty: 1, unitPrice: '4500'}]})));
  assert.match(draft, /Hello Example Gadgets EU Support/);
  assert.match(draft, /JPY 4500\./);
  assert.match(draft, /Original note in Korean/);
});
