import {Observable} from '../core/observable.mjs';
import {newRequestKey} from '../core/http-client.mjs';
import {thisMonth} from '../core/format.mjs';
import {isOpen, stepIndex, selectNextAction, selectActivity, NEXT_PRIORITY} from './claim-progress.mjs';

const FILTERS = {query: '', group: '', vendor: '', currency: '', sort: 'recent'};

// Claims for the home screen, the claim list and the trash, with search,
// filters and sorting for the list.
export class ClaimListViewModel extends Observable {
  constructor({models}) {
    super({claims: [], deleted: false, ...FILTERS, loading: false, error: ''});
    this.models = models;
  }

  async load({deleted = false} = {}) {
    if (deleted !== this.state.deleted) this.setState({claims: [], ...FILTERS});
    this.setState({deleted, loading: true, error: ''});
    try {
      this.setState({claims: await this.models.claims.list({deleted}), loading: false});
    } catch (error) {
      this.setState({loading: false, error: error.message});
    }
  }

  setQuery(query) {
    this.setState({query});
  }

  // patch: any of {group, vendor, currency, sort}
  setFilters(patch) {
    this.setState(patch);
  }

  clearFilters() {
    this.setState(FILTERS);
  }

  // Creates the claim, then attaches the evidence picked in the new-claim
  // flow one file at a time. A file that fails does not undo the claim; its
  // name comes back in `failed` so the user can add it again.
  async create(input, key, files = []) {
    let claim = await this.models.claims.create(input, key);
    const failed = [];
    for (const file of files) {
      try {
        claim = (await this.models.claims.uploadFile(claim.id, claim.version, file, newRequestKey())).claim;
      } catch (error) {
        failed.push({name: file.name, message: error.message});
      }
    }
    return {claim, failed};
  }

  async restore(claim) {
    await this.models.claims.restore(claim.id, claim.version);
    await this.load({deleted: true});
  }
}

// ---------- Selectors: derived values the views read from list state ----------

export const LIST_GROUPS = Object.freeze([['', '전체'], ['active', '진행 중'], ['disputed', '분쟁'], ['closed', '종료'], ['waived', '포기']]);
export const LIST_SORTS = Object.freeze([['recent', '최근 수정 순'], ['remaining', '미회수 금액 순'], ['stage', '진행 단계 순']]);

const groupOf = claim => ({completed: 'closed', waived: 'waived', disputed: 'disputed'})[claim.state] ?? 'active';

// Amounts in different currencies cannot be compared, so "미회수 금액 순"
// groups by currency first and sorts by the remaining amount inside each.
const SORTERS = {
  recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  remaining: (a, b) => a.currency.localeCompare(b.currency) || b.summary.remaining - a.summary.remaining,
  stage: (a, b) => stepIndex(a) - stepIndex(b) || b.updatedAt.localeCompare(a.updatedAt),
};

export function selectVisibleClaims({claims, query = '', group = '', vendor = '', currency = '', sort = 'recent'}) {
  const needle = query.trim().toLowerCase();
  return claims
    .filter(claim => !group || groupOf(claim) === group)
    .filter(claim => !vendor || claim.vendor === vendor)
    .filter(claim => !currency || claim.currency === currency)
    .filter(claim => !needle || [claim.title, claim.vendor, claim.orderRef, claim.issue].join(' ').toLowerCase().includes(needle))
    .sort(SORTERS[sort] ?? SORTERS.recent);
}

export function selectGroupCounts(claims) {
  const counts = Object.fromEntries(LIST_GROUPS.map(([key]) => [key, 0]));
  for (const claim of claims) {
    counts[''] += 1;
    counts[groupOf(claim)] += 1;
  }
  return counts;
}

export function selectFilterOptions(claims) {
  const unique = values => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return {vendors: unique(claims.map(claim => claim.vendor)), currencies: unique(claims.map(claim => claim.currency))};
}

// Home figures. Totals stay per currency; different currencies are never added.
//   claimed / remaining: open refund claims only (exchanges and repairs are owed
//   goods or work, not money). received: all money ever received.
//   month: money received in `month` (YYYY-MM), net of corrections made that month.
export function selectMetrics({claims}, {month = thisMonth()} = {}) {
  const active = claims.filter(isOpen);
  const byCurrency = new Map();
  for (const claim of claims) {
    const row = byCurrency.get(claim.currency) ?? {currency: claim.currency, claimed: 0, received: 0, remaining: 0, month: 0};
    row.received += claim.summary.cash;
    if (isOpen(claim) && claim.kind === 'refund') {
      row.claimed += claim.claimed;
      row.remaining += claim.summary.remaining;
    }
    for (const entry of claim.ledger ?? []) {
      if (!entry.receivedOn?.startsWith(month)) continue;
      if (entry.kind === 'cash') row.month += entry.amount;
      if (entry.kind === 'reversal') row.month -= entry.amount;
    }
    byCurrency.set(claim.currency, row);
  }
  return {
    activeCount: active.length,
    awaitingCount: active.filter(claim => claim.state === 'awaiting').length,
    byCurrency: [...byCurrency.values()],
  };
}

// "지금 해야 할 일": open claims whose next step the user can take now, most
// urgent first; among equals, the one left alone longest.
export function selectTodo(claims, {aiEnabled = false, limit = 3} = {}) {
  return claims
    .filter(isOpen)
    .map(claim => ({claim, next: selectNextAction(claim, {aiEnabled})}))
    .filter(({next}) => NEXT_PRIORITY.includes(next.key))
    .sort((a, b) => NEXT_PRIORITY.indexOf(a.next.key) - NEXT_PRIORITY.indexOf(b.next.key) || a.claim.updatedAt.localeCompare(b.claim.updatedAt))
    .slice(0, limit);
}

export function selectInProgress(claims, {limit = 4} = {}) {
  return claims.filter(isOpen).sort(SORTERS.recent).slice(0, limit);
}

export function selectRecentActivity(claims, labels, {limit = 6} = {}) {
  return claims.flatMap(claim => selectActivity(claim, labels)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
