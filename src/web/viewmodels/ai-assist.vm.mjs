import {Observable} from '../core/observable.mjs';

// AI helpers (translation, reply analysis, document reading). Asks for consent
// first, turns "consent required" from the server back into the consent dialog,
// and exposes what is running (busy + startedAt) so the view can show progress.
export class AiAssistViewModel extends Observable {
  #controller = null;

  constructor({models, session, app}) {
    // busy: which AI task runs ('' | 'translate' | 'reply' | 'extract'),
    // target: what it runs on (the file id for 'extract'), startedAt: ms timestamp.
    super({busy: '', target: '', startedAt: 0});
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

  // Stops waiting for the current AI call. The result, if it still arrives, is ignored.
  cancel() {
    this.#controller?.abort();
  }

  async #run(kind, call, target = '') {
    if (this.state.busy) throw new Error('다른 AI 작업이 진행 중이에요. 끝나거나 취소한 뒤 다시 시도하세요.');
    const controller = new AbortController();
    this.#controller = controller;
    this.setState({busy: kind, target, startedAt: Date.now()});
    try {
      return await call(controller.signal);
    } catch (error) {
      if (error.code === 'ai_consent_required') {
        await this.session.refresh();
        this.app.openOverlay('ai-consent', {});
      }
      throw error;
    } finally {
      if (this.#controller === controller) this.#controller = null;
      this.setState({busy: '', target: '', startedAt: 0});
    }
  }

  translateIssue(text) {
    return this.#run('translate', signal => this.models.ai.translateIssue(text, {signal}));
  }

  analyzeReply(claimId, body) {
    return this.#run('reply', signal => this.models.ai.analyzeReply(claimId, body, {signal}));
  }

  async extract(claimId, fileId) {
    const result = await this.#run('extract', signal => this.models.ai.extract(claimId, fileId, {signal}), fileId);
    this.app.openDialog('extraction', {result});
    return result;
  }

  // New-claim flow: read an order document before the claim exists. The
  // caller fills the form with result.suggestion for the user to check.
  extractDocument(file) {
    return this.#run('extract-doc', signal => this.models.ai.extractDocument(file, {signal}));
  }
}
