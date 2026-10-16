import {Observable} from '../core/observable.mjs';

// Claim list for the dashboard and the trash, with search and state filter.
export class ClaimListViewModel extends Observable {
  constructor({models}) {
    super({claims: [], deleted: false, query: '', filter: '', loading: false, error: ''});
    this.models = models;
  }

  async load({deleted = false} = {}) {
    if (deleted !== this.state.deleted) this.setState({claims: [], query: '', filter: ''});
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

  setFilter(filter) {
    this.setState({filter});
  }

  async create(input, key) {
    return this.models.claims.create(input, key);
  }

  async restore(claim) {
    await this.models.claims.restore(claim.id, claim.version);
    await this.load({deleted: true});
  }
}

// Selectors: derived values the views read from list state.
export function selectVisibleClaims({claims, query, filter}) {
  const needle = query.trim().toLowerCase();
  return claims
    .filter(claim => !filter || claim.state === filter)
    .filter(claim => !needle || [claim.title, claim.vendor, claim.orderRef, claim.issue].join(' ').toLowerCase().includes(needle));
}

// Totals per currency; different currencies are never added together.
export function selectMetrics({claims}) {
  const active = claims.filter(claim => !['completed', 'waived'].includes(claim.state));
  const byCurrency = new Map();
  for (const claim of claims) {
    const row = byCurrency.get(claim.currency) ?? {currency: claim.currency, claimed: 0, received: 0, remaining: 0};
    row.received += claim.summary.cash;
    if (active.includes(claim)) {
      row.claimed += claim.claimed;
      row.remaining += claim.summary.remaining;
    }
    byCurrency.set(claim.currency, row);
  }
  return {activeCount: active.length, byCurrency: [...byCurrency.values()]};
}
