import {Observable} from '../core/observable.mjs';

// AI helpers (translation, reply analysis, document reading). Asks for consent
// first and turns "consent required" from the server back into the consent dialog.
export class AiAssistViewModel extends Observable {
  constructor({models, session, app}) {
    super({busy: ''});
    this.models = models;
    this.session = session;
    this.app = app;
  }

  get enabled() {
    return this.session.state.ai.enabled;
  }

  // Runs next() now if the user has consented; otherwise shows the consent
  // dialog and runs next() after they agree.
  ensureConsent(next) {
    if (this.session.state.ai.consented) return next();
    this.app.openOverlay('ai-consent', {onAgree: next});
    return null;
  }

  async agree(onAgree) {
    await this.session.setAiConsent(true);
    this.app.closeOverlay();
    if (onAgree) await onAgree();
  }

  async #run(kind, call) {
    this.setState({busy: kind});
    try {
      return await call();
    } catch (error) {
      if (error.code === 'ai_consent_required') {
        await this.session.refresh();
        this.app.openOverlay('ai-consent', {});
      }
      throw error;
    } finally {
      this.setState({busy: ''});
    }
  }

  translateIssue(text) {
    return this.#run('translate', () => this.models.ai.translateIssue(text));
  }

  analyzeReply(claimId, body) {
    return this.#run('reply', () => this.models.ai.analyzeReply(claimId, body));
  }

  async extract(claimId, fileId) {
    const result = await this.#run('extract', () => this.models.ai.extract(claimId, fileId));
    this.app.openDialog('extraction', {result});
    return result;
  }
}
