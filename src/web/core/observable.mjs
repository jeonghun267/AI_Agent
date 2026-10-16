// Base class for every ViewModel: holds immutable state snapshots and tells
// subscribers (the views) when they change. ViewModels never touch the DOM.
export class Observable {
  #state;
  #listeners = new Set();

  constructor(initialState) {
    this.#state = Object.freeze({...initialState});
  }

  get state() {
    return this.#state;
  }

  setState(patch) {
    const next = typeof patch === 'function' ? patch(this.#state) : patch;
    this.#state = Object.freeze({...this.#state, ...next});
    for (const listener of this.#listeners) listener(this.#state);
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
