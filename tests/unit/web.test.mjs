// Pure web-layer logic that runs in Node without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {html, toMarkup, raw} from '../../src/web/core/html.mjs';
import {money, decimal, currencyDigits, parseAmount} from '../../src/web/core/format.mjs';
import {parseHash, routeHash, isLinkHash} from '../../src/web/core/hash-router.mjs';
import {createPreparationController} from '../../src/web/core/preparation.mjs';
import {Observable} from '../../src/web/core/observable.mjs';
import {selectMetrics, selectVisibleClaims, selectGroupCounts, selectTodo} from '../../src/web/viewmodels/claim-list.vm.mjs';
import {selectNeedsEmailVerification} from '../../src/web/viewmodels/session.vm.mjs';
import {selectProgress, selectRecovery, selectNextAction, selectActivity} from '../../src/web/viewmodels/claim-progress.mjs';

// A claim view as the API returns it, with only what the selectors read.
function claimView(patch = {}) {
  return {
    id: 'c1', title: 'USB-C 허브', vendor: 'Example', orderRef: 'O-1', issue: '', kind: 'refund', currency: 'EUR',
    state: 'preparing', deleted: false, claimed: 3990, agreed: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    files: [], drafts: [], replies: [], ledger: [], summary: {cash: 0, goods: 0, repair: false, remaining: 3990, requestedQty: 1},
    ...patch,
  };
}
const file = {id: 'f1', name: 'order.pdf', createdAt: '2026-10-02T00:00:00Z'};
const sent = {id: 'd1', createdAt: '2026-10-03T00:00:00Z', submittedAt: '2026-10-03T01:00:00Z', stale: false};

test('progress steps follow the claim state; disputes and waivers are flagged', () => {
  const statuses = state => selectProgress({state}).steps.map(step => step.status[0]).join('');
  assert.equal(statuses('preparing'), 'cttttt');
  assert.equal(statuses('awaiting'), 'ddcttt');
  assert.equal(statuses('partial'), 'ddddct');
  assert.equal(statuses('recovered'), 'dddddc', 'everything came back; only closing is left');
  assert.equal(statuses('completed'), 'dddddd');
  assert.equal(selectProgress({state: 'disputed'}).flag, 'disputed');
  assert.equal(statuses('disputed'), 'dddctt');
  assert.deepEqual([selectProgress({state: 'waived'}).flag, statuses('waived')], ['waived', 'tttttt']);
});

test('recovery compares what came back with what was asked for', () => {
  const summary = {cash: 2000, goods: 1, repair: false, requestedQty: 2};
  assert.deepEqual(selectRecovery({kind: 'refund', currency: 'EUR', claimed: 7980, agreed: 3990, summary}),
    {unit: 'money', got: 2000, target: 3990, currency: 'EUR', percent: 50, basis: '합의액 기준'});
  assert.equal(selectRecovery({kind: 'refund', currency: 'EUR', claimed: 4000, agreed: null, summary}).basis, '청구액 기준');
  assert.equal(selectRecovery({kind: 'exchange', summary}).percent, 50);
  assert.equal(selectRecovery({kind: 'repair', summary: {...summary, repair: true}}).percent, 100);
  assert.equal(selectRecovery({kind: 'refund', currency: 'EUR', claimed: 100, agreed: 0, summary: {...summary, cash: 0}}).percent, 0, 'no division by zero');
});

test('html templates escape values unless they are templates themselves', () => {
  const name = '<img src=x onerror=alert(1)>';
  assert.equal(toMarkup(html`<p title="${name}">${name}</p>`), '<p title="&lt;img src=x onerror=alert(1)&gt;">&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(toMarkup(html`<ul>${['a', 'b'].map(item => html`<li>${item}</li>`)}</ul>`), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(toMarkup(html`${null}${false}${raw('<b>ok</b>')}`), '<b>ok</b>');
});

test('money uses each currency\'s own decimals', () => {
  assert.equal(currencyDigits('JPY'), 0);
  assert.equal(decimal(3990, 'EUR'), '39.90');
  assert.equal(decimal(4500, 'JPY'), '4500');
  assert.equal(decimal(null, 'EUR'), '');
  assert.match(money(3990, 'EUR'), /39\.90/);
});

test('hash routes round-trip', () => {
  for (const hash of ['#/', '#/claims', '#/trash', '#/settings', '#/forgot', '#/claims/abc-123', '#/claims/abc-123/files', '#/reset/Ab_c-1', '#/verify/Xy-9_z']) {
    assert.equal(routeHash(parseHash(hash)), hash);
  }
  assert.deepEqual(parseHash('#/claims/x'), {name: 'claim', id: 'x', tab: 'overview'});
  assert.deepEqual(parseHash('#/unknown'), {name: 'dashboard'});
  assert.deepEqual(parseHash('#/reset/tok'), {name: 'reset', token: 'tok'});
  assert.deepEqual(parseHash('#/reset'), {name: 'dashboard'}, 'a reset link without its token is not a reset screen');
  assert.equal(isLinkHash('#/verify/tok'), true);
  assert.equal(isLinkHash('#/settings'), false);
});

test('the verification band shows only for signed-in, unverified users when mail works', () => {
  const base = {status: 'signedIn', user: {emailVerifiedAt: null}, config: {mail: {enabled: true}}};
  assert.equal(selectNeedsEmailVerification(base), true);
  assert.equal(selectNeedsEmailVerification({...base, user: {emailVerifiedAt: '2026-10-17T00:00:00Z'}}), false);
  assert.equal(selectNeedsEmailVerification({...base, config: {mail: {enabled: false}}}), false);
  assert.equal(selectNeedsEmailVerification({...base, status: 'signedOut', user: null}), false);
});

test('home metrics never add currencies together and count only money that is owed', () => {
  const claim = (currency, claimed, cash, patch = {}) => claimView({currency, claimed, state: 'negotiating', summary: {cash, remaining: claimed - cash}, ...patch});
  const metrics = selectMetrics({claims: [
    claim('EUR', 1000, 200, {ledger: [{kind: 'cash', amount: 200, receivedOn: '2026-10-05'}, {kind: 'cash', amount: 50, receivedOn: '2026-09-30'}]}),
    claim('JPY', 4500, 0, {state: 'awaiting'}),
    claim('EUR', 500, 500, {state: 'completed', ledger: [{kind: 'cash', amount: 500, receivedOn: '2026-10-09'}, {kind: 'reversal', amount: 100, receivedOn: '2026-10-10'}]}),
    claim('USD', 12000, 0, {kind: 'exchange'}),
  ]}, {month: '2026-10'});
  assert.equal(metrics.activeCount, 3);
  assert.equal(metrics.awaitingCount, 1);
  assert.deepEqual(metrics.byCurrency, [
    {currency: 'EUR', claimed: 1000, received: 700, remaining: 800, month: 600},
    {currency: 'JPY', claimed: 4500, received: 0, remaining: 4500, month: 0},
    {currency: 'USD', claimed: 0, received: 0, remaining: 0, month: 0},
  ], 'an exchange is owed goods, not money');
});

test('the claim list filters by status group, vendor and currency, and sorts', () => {
  const claims = [
    claimView({id: 'a', vendor: 'Amazon', currency: 'USD', state: 'awaiting', updatedAt: '2026-10-03', summary: {remaining: 100}}),
    claimView({id: 'b', vendor: 'Rakuten', currency: 'JPY', state: 'disputed', updatedAt: '2026-10-05', summary: {remaining: 9000}}),
    claimView({id: 'c', vendor: 'Amazon', currency: 'USD', state: 'completed', updatedAt: '2026-10-04', summary: {remaining: 0}}),
    claimView({id: 'd', vendor: 'Amazon', currency: 'USD', state: 'preparing', updatedAt: '2026-10-01', summary: {remaining: 500}}),
  ];
  const ids = filters => selectVisibleClaims({claims, ...filters}).map(claim => claim.id);
  assert.deepEqual(ids({}), ['b', 'c', 'a', 'd'], 'most recently changed first');
  assert.deepEqual(ids({group: 'active'}), ['a', 'd']);
  assert.deepEqual(ids({group: 'disputed'}), ['b']);
  assert.deepEqual(ids({group: 'closed'}), ['c']);
  assert.deepEqual(ids({vendor: 'Amazon', currency: 'USD', query: 'o-1'}), ['c', 'a', 'd']);
  assert.deepEqual(ids({sort: 'remaining'}), ['b', 'd', 'a', 'c'], 'grouped by currency, then the larger remaining amount');
  assert.deepEqual(ids({sort: 'stage'}), ['d', 'a', 'b', 'c'], 'least progressed first');
  assert.deepEqual(selectGroupCounts(claims), {'': 4, active: 2, disputed: 1, closed: 1, waived: 0});
});

test('the next action follows the claim from evidence to closing', () => {
  const key = patch => selectNextAction(claimView(patch)).key;
  assert.equal(key({}), 'upload');
  assert.equal(key({files: [file]}), 'draft');
  assert.equal(key({files: [file], drafts: [{...sent, submittedAt: null}]}), 'submit');
  assert.equal(key({files: [file], drafts: [{...sent, submittedAt: null, stale: true}]}), 'stale');
  assert.equal(key({files: [file], drafts: [sent], state: 'awaiting'}), 'reply');
  const reply = kind => ({kind, recordedAt: '2026-10-04T00:00:00Z'});
  assert.equal(key({files: [file], drafts: [sent], state: 'awaiting', replies: [reply('evidence')]}), 'evidence');
  assert.equal(key({files: [file], drafts: [sent], state: 'awaiting', replies: [reply('agreement')]}), 'agree');
  assert.equal(key({files: [file], drafts: [sent], state: 'awaiting', replies: [reply('refund_notice')], agreed: 3990}), 'receipt');
  assert.equal(key({files: [file], drafts: [sent], state: 'partial', agreed: 3990}), 'receipt');
  assert.equal(key({files: [file], drafts: [sent], state: 'recovered'}), 'close');
  assert.equal(key({state: 'disputed'}), 'dispute');
  assert.equal(key({state: 'completed'}), 'done');
  assert.equal(key({state: 'waived'}), 'reopen');
  assert.equal(key({deleted: true, state: 'awaiting'}), 'restore');
  assert.equal(key({kind: 'exchange', files: [file], drafts: [sent], state: 'negotiating'}), 'receipt', 'exchanges need no agreed amount');
  assert.equal(selectNextAction(claimView({state: 'disputed'})).tone, 'attention');
});

test('home lists what can be done now before what is waiting', () => {
  const claims = [
    claimView({id: 'waiting', files: [file], drafts: [sent], state: 'awaiting'}),
    claimView({id: 'evidence', updatedAt: '2026-10-02'}),
    claimView({id: 'done', state: 'recovered'}),
    claimView({id: 'closed', state: 'completed'}),
    claimView({id: 'older-evidence', updatedAt: '2026-09-01'}),
  ];
  assert.deepEqual(selectTodo(claims, {limit: 4}).map(({claim}) => claim.id), ['done', 'older-evidence', 'evidence', 'waiting']);
});

test('the activity feed is built from the claim records, newest first', () => {
  const claim = claimView({
    files: [file], drafts: [sent],
    replies: [{kind: 'denied', recordedAt: '2026-10-04T00:00:00Z'}],
    ledger: [{kind: 'cash', amount: 2000, createdAt: '2026-10-05T00:00:00Z'}],
  });
  assert.deepEqual(selectActivity(claim, {replyKinds: {denied: '거절·분쟁'}}).map(item => item.kind), ['receipt', 'reply', 'sent', 'draft', 'file', 'create']);
  assert.match(selectActivity(claim, {replyKinds: {}})[0].text, /입금 확인 · €20\.00/);
});

test('typed amounts become minor units only when valid for the currency', () => {
  assert.equal(parseAmount('39.9', 'EUR'), 3990);
  assert.equal(parseAmount('1,234.50', 'USD'), 123450);
  assert.equal(parseAmount('4500', 'JPY'), 4500);
  assert.equal(parseAmount('45.5', 'JPY'), null);
  assert.equal(parseAmount('1.001', 'EUR'), null);
  assert.equal(parseAmount('', 'EUR'), null);
});

test('preparation shows Dori for the minimum time and drops cancelled results', async () => {
  const timers = [];
  const schedule = (fn, ms) => { timers.push({fn, ms}); return timers.length; };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const flush = async () => { while (timers.length) { timers.shift().fn(); await settle(); } };
  const results = [];
  const controller = createPreparationController({schedule, unschedule: () => {}});
  controller.start({work: async () => 'draft', delay: 2500, onSuccess: value => results.push(value)});
  assert.equal(controller.start({work: async () => 'second'}), false, 'only one job at a time');
  await flush();
  assert.deepEqual(results, ['draft']);

  const cancelled = [];
  controller.start({work: async () => 'late', onSuccess: value => results.push(value), onCancel: reason => cancelled.push(reason)});
  controller.cancel();
  await flush();
  assert.deepEqual(results, ['draft']);
  assert.deepEqual(cancelled, ['cancelled']);
});

test('observable state is immutable and notifies subscribers', () => {
  const vm = new Observable({count: 0});
  const seen = [];
  const unsubscribe = vm.subscribe(state => seen.push(state.count));
  vm.setState({count: 1});
  vm.setState(state => ({count: state.count + 1}));
  unsubscribe();
  vm.setState({count: 9});
  assert.deepEqual(seen, [1, 2]);
  assert.throws(() => { 'use strict'; vm.state.count = 5; });
});
