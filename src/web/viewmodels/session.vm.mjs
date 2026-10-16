import {Observable} from '../core/observable.mjs';

// The band asking to confirm the address shows only when mail can actually be sent.
export const selectNeedsEmailVerification = session =>
  session.status === 'signedIn' && !session.user?.emailVerifiedAt && !!session.config?.mail?.enabled;

// Who is signed in, the server's reference data (/api/config) and AI status.
//   resetRequest - {email} after a password-reset link was requested on this screen
export class SessionViewModel extends Observable {
  constructor({models, http}) {
    super({status: 'loading', user: null, config: null, ai: {enabled: false, consented: false, model: null}, expired: false, resetRequest: null});
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

  // Works signed in or out; when signed in, reloads the user so the band disappears.
  async verifyEmail(token) {
    await this.models.auth.verifyEmail(token);
    if (this.state.status === 'signedIn') await this.#loadMe();
  }

  // Returns false when the address turned out to be verified already.
  async resendVerification() {
    const {sent} = await this.models.auth.resendVerification();
    if (!sent) await this.#loadMe();
    return sent;
  }

  async requestPasswordReset(email) {
    await this.models.auth.forgotPassword(email);
    this.setState({resetRequest: {email}});
  }

  clearResetRequest() {
    if (this.state.resetRequest) this.setState({resetRequest: null});
  }

  // The server ends every session of that account and this browser's own one.
  async resetPassword(token, password) {
    await this.models.auth.resetPassword(token, password);
    this.setState({resetRequest: null});
    if (this.state.status === 'signedIn') this.forgetUser();
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
