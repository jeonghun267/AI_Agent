import {Observable} from '../core/observable.mjs';

// Who is signed in, the server's reference data (/api/config) and AI status.
export class SessionViewModel extends Observable {
  constructor({models, http}) {
    super({status: 'loading', user: null, config: null, ai: {enabled: false, consented: false, model: null}, expired: false});
    this.models = models;
    this.http = http;
    this.onSignedIn = () => {};
    this.onSignedOut = () => {};
  }

  async init() {
    const config = await this.models.config.load();
    this.setState({config, ai: {...config.ai, consented: false}});
    try {
      await this.#loadMe();
    } catch {
      this.setState({status: 'signedOut'});
    }
  }

  async #loadMe() {
    const me = await this.models.auth.me();
    this.http.setCsrf(me.csrf);
    this.setState({status: 'signedIn', user: me.user, ai: me.ai, expired: false});
  }

  async login(email, password) {
    await this.models.auth.login(email, password);
    await this.#loadMe();
    await this.onSignedIn();
  }

  async signup(input) {
    await this.models.auth.signup(input);
    await this.#loadMe();
    await this.onSignedIn();
  }

  async logout() {
    try { await this.models.auth.logout(); } finally { this.#signedOut(false); }
  }

  // Called by the HTTP client when any request comes back 401.
  expire() {
    if (this.state.status === 'signedIn') this.#signedOut(true);
  }

  // After account deletion the session is already gone on the server.
  forgetUser() {
    this.#signedOut(false);
  }

  #signedOut(expired) {
    this.http.setCsrf('');
    this.setState({status: 'signedOut', user: null, expired, ai: {...this.state.ai, consented: false}});
    this.onSignedOut();
  }

  async setAiConsent(consent) {
    const user = await this.models.account.setAiConsent(consent);
    this.setState({user, ai: {...this.state.ai, consented: !!user.aiConsentAt}});
  }

  async refresh() {
    await this.#loadMe();
  }

  exportData() {
    return this.models.account.exportData();
  }

  // Permanent. The server ends the session; we only forget the user locally.
  async deleteAccount(password) {
    await this.models.account.deleteAccount(password);
    this.forgetUser();
  }
}
