import {Observable} from '../core/observable.mjs';
import {newRequestKey} from '../core/http-client.mjs';

export const DETAIL_TABS = ['overview', 'files', 'inquiry', 'replies', 'ledger', 'history'];

// One claim and every action on it. Each mutation replaces `claim` with the
// server's answer. On a version conflict the latest claim is reloaded and the
// error is passed on so the form can say so.
export class ClaimDetailViewModel extends Observable {
  constructor({models}) {
    super({claim: null, tab: 'overview', loading: false, error: '', upload: null});
    this.models = models;
  }

  setTab(tab) {
    this.setState({tab: DETAIL_TABS.includes(tab) ? tab : 'overview'});
  }

  async open(id, tab = 'overview') {
    this.setTab(tab);
    this.setState({claim: null, loading: true, error: '', upload: null});
    try {
      this.setState({claim: await this.#fetch(id), loading: false});
    } catch (error) {
      this.setState({loading: false, error: error.message});
    }
  }

  // Claims in the trash are only returned with ?deleted=1.
  async #fetch(id) {
    try {
      return await this.models.claims.get(id);
    } catch (error) {
      if (error.status !== 404) throw error;
      return this.models.claims.get(id, {deleted: true});
    }
  }

  async refresh() {
    if (this.state.claim) this.setState({claim: await this.#fetch(this.state.claim.id)});
  }

  async #mutate(action) {
    const {claim} = this.state;
    try {
      const updated = await action(claim);
      this.setState({claim: updated});
      return updated;
    } catch (error) {
      if (error.code === 'conflict') await this.refresh();
      throw error;
    }
  }

  update(input) {
    return this.#mutate(claim => this.models.claims.update(claim.id, claim.version, input));
  }

  transition(action, reason) {
    return this.#mutate(claim => this.models.claims.transition(claim.id, claim.version, action, reason));
  }

  moveToTrash(reason) {
    return this.#mutate(claim => this.models.claims.moveToTrash(claim.id, claim.version, reason));
  }

  restore() {
    return this.#mutate(claim => this.models.claims.restore(claim.id, claim.version));
  }

  // Keeps the File and its retry key so a failed upload can be retried as the
  // same request (the server then answers with the first result, not a copy).
  async uploadFile(file) {
    const {claim, upload} = this.state;
    if (upload?.saving) throw new Error('이전 파일 저장을 먼저 확인하세요.');
    this.setState({upload: {file, name: file.name, key: newRequestKey(), version: claim.version, saving: false, error: ''}});
    return this.retryUpload();
  }

  async retryUpload() {
    const upload = this.state.upload;
    if (!upload || upload.saving) return null;
    this.setState({upload: {...upload, saving: true, error: ''}});
    try {
      const result = await this.models.claims.uploadFile(this.state.claim.id, upload.version, upload.file, upload.key);
      this.setState({claim: result.claim, upload: null});
      return result;
    } catch (error) {
      if (error.code === 'conflict') {
        await this.refresh();
        this.setState({upload: {...upload, saving: false, version: this.state.claim.version, key: newRequestKey(), error: error.message}});
      } else {
        this.setState({upload: {...upload, saving: false, error: error.message}});
      }
      throw error;
    }
  }

  removeFile(fileId) {
    return this.#mutate(claim => this.models.claims.removeFile(claim.id, claim.version, fileId));
  }

  downloadFile(fileId) {
    return this.models.claims.downloadFile(fileId);
  }

  saveDraft(draft, key) {
    return this.#mutate(claim => this.models.claims.saveDraft(claim.id, claim.version, draft, key));
  }

  submitDraft(submission, key) {
    return this.#mutate(claim => this.models.claims.submitDraft(claim.id, claim.version, submission, key));
  }

  recordReply(reply) {
    return this.#mutate(claim => this.models.claims.recordReply(claim.id, claim.version, reply));
  }

  recordReceipt(receipt, key) {
    return this.#mutate(async claim => (await this.models.claims.recordReceipt(claim.id, claim.version, receipt, key)).claim);
  }
}
