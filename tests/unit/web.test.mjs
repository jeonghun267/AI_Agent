// Pure web-layer logic that runs in Node without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {html, toMarkup, raw} from '../../src/web/core/html.mjs';
import {money, decimal, currencyDigits} from '../../src/web/core/format.mjs';
import {parseHash, routeHash, isLinkHash} from '../../src/web/core/hash-router.mjs';
import {createPreparationController} from '../../src/web/core/preparation.mjs';
import {Observable} from '../../src/web/core/observable.mjs';
import {selectMetrics, selectVisibleClaims} from '../../src/web/viewmodels/claim-list.vm.mjs';
import {selectNeedsEmailVerification} from '../../src/web/viewmodels/session.vm.mjs';

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
  for (const hash of ['#/', '#/trash', '#/settings', '#/forgot', '#/claims/abc-123', '#/claims/abc-123/files', '#/reset/Ab_c-1', '#/verify/Xy-9_z']) {
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

test('dashboard metrics never add different currencies together', () => {
  const claim = (currency, claimed, cash, state = 'negotiating') => ({currency, claimed, state, summary: {cash, remaining: claimed - cash}, title: 't', vendor: 'v', orderRef: 'o', issue: ''});
  const metrics = selectMetrics({claims: [claim('EUR', 1000, 200), claim('JPY', 4500, 0), claim('EUR', 500, 500, 'completed')]});
  assert.equal(metrics.activeCount, 2);
  assert.deepEqual(metrics.byCurrency, [
    {currency: 'EUR', claimed: 1000, received: 700, remaining: 800},
    {currency: 'JPY', claimed: 4500, received: 0, remaining: 4500},
  ]);
  const visible = selectVisibleClaims({claims: [{...claim('EUR', 1, 0), vendor: 'Amazon'}, claim('EUR', 1, 0)], query: 'amazon', filter: ''});
  assert.equal(visible.length, 1);
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
