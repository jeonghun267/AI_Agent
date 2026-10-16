import {Observable} from '../core/observable.mjs';
import {createPreparationController, PREPARATION_DELAY_MS} from '../core/preparation.mjs';

// Preparing an inquiry: shows Dori while the AI (or rule-based) draft is
// fetched, then opens the editor. Saving goes through the claim detail VM.
export class DraftViewModel extends Observable {
  #preparation = createPreparationController();

  constructor({models, app, detail}) {
    super({preparing: false});
    this.models = models;
    this.app = app;
    this.detail = detail;
  }

  prepare({useAi, reducedMotion = false}) {
    const claim = this.detail.state.claim;
    if (!claim || this.#preparation.running) return;
    this.app.openDialog('draft-preparing', {kind: claim.kind, useAi, still: reducedMotion});
    this.setState({preparing: true});
    this.#preparation.start({
      delay: reducedMotion ? 0 : PREPARATION_DELAY_MS,
      work: () => this.#suggest(claim.id, useAi),
      onSuccess: suggestion => {
        this.setState({preparing: false});
        this.app.openDialog('draft-editor', {suggestion});
      },
      onError: error => {
        this.setState({preparing: false});
        this.app.closeDialog();
        this.app.notify(error.message);
      },
      onCancel: () => this.setState({preparing: false}),
    });
  }

  // AI first when asked; if it fails for any reason other than consent,
  // fall back to the rule-based template and say why.
  async #suggest(claimId, useAi) {
    if (!useAi) return this.models.claims.draftTemplate(claimId);
    try {
      return await this.models.ai.draft(claimId);
    } catch (error) {
      if (error.code === 'ai_consent_required' || error.code === 'session_expired') throw error;
      const template = await this.models.claims.draftTemplate(claimId);
      return {...template, notice: `AI 초안을 만들지 못해 기본 틀을 대신 보여드려요. (${error.message})`};
    }
  }

  cancel() {
    this.#preparation.cancel();
  }

  editLatest() {
    const latest = this.detail.state.claim?.drafts[0];
    if (latest) this.app.openDialog('draft-editor', {suggestion: {body: latest.body, origin: latest.origin, model: latest.model, notice: ''}});
  }

  async save(body, suggestion, key) {
    await this.detail.saveDraft({body, origin: suggestion.origin, model: suggestion.model || ''}, key);
    this.app.closeDialog();
  }
}
