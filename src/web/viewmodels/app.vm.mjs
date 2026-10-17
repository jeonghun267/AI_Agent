import {Observable} from '../core/observable.mjs';

const PUBLIC_ROUTES = ['login', 'signup', 'forgot', 'reset'];
// Also open while signed in: the emailed link proves the mailbox, and a reset
// ends this browser's session anyway.
const OPEN_ROUTES = ['reset'];

// Top-level UI state: current route, open dialogs, toast, connectivity.
// It also decides which data to load when the route changes.
//   dialog  - the main modal (forms, previews)
//   overlay - a second layer on top of it (AI consent), so an open form keeps its input
export class AppViewModel extends Observable {
  #counter = 0;
  #toastTimer = null;
  #returnTo = null;

  constructor({session, list, detail}) {
    super({route: {name: 'dashboard'}, dialog: null, overlay: null, toast: null, offline: false});
    this.session = session;
    this.list = list;
    this.detail = detail;
  }

  // Sets the starting route from the URL before the session is known, so the
  // first signed-in render does not overwrite a deep link.
  start(route) {
    this.setState({route});
  }

  async setRoute(route) {
    if (route.name === 'verify') return this.#verifyEmail(route.token);
    const previous = this.state.route;
    const signedIn = this.session.state.status === 'signedIn';
    if (!signedIn && !PUBLIC_ROUTES.includes(route.name)) {
      if (route.name !== 'dashboard') this.#returnTo = route;
      route = {name: 'login'};
    }
    if (signedIn && PUBLIC_ROUTES.includes(route.name) && !OPEN_ROUTES.includes(route.name)) route = {name: 'dashboard'};
    if (route.name === 'forgot' && previous.name !== 'forgot') this.session.clearResetRequest();
    this.setState({route});
    if (!signedIn) return;
    if (route.name === 'dashboard' || route.name === 'claims') await this.list.load({deleted: false});
    if (route.name === 'trash') await this.list.load({deleted: true});
    if (route.name === 'claim') {
      const sameClaim = previous.name === 'claim' && previous.id === route.id && this.detail.state.claim?.id === route.id;
      if (sameClaim) this.detail.setTab(route.tab);
      else await this.detail.open(route.id, route.tab);
    }
  }

  // A verification link is an action, not a page: confirm, say so, move on.
  async #verifyEmail(token) {
    const signedIn = this.session.state.status === 'signedIn';
    try {
      await this.session.verifyEmail(token);
      this.notify(signedIn ? '이메일 인증을 마쳤어요.' : '이메일 인증을 마쳤어요. 로그인해 주세요.');
    } catch (error) {
      this.notify(error.message);
    }
    return this.setRoute({name: signedIn ? 'dashboard' : 'login'});
  }

  // From the #/reset/:token screen. Everyone signs in again afterwards.
  async resetPassword(password) {
    await this.session.resetPassword(this.state.route.token, password);
    this.notify('비밀번호를 바꿨어요. 새 비밀번호로 로그인하세요.');
    return this.setRoute({name: 'login'});
  }

  // Programmatic navigation; the view mirrors state.route into location.hash.
  go(route) {
    return this.setRoute(route);
  }

  // After an expired session, signing in again returns to the same screen.
  afterSignOut(expired) {
    const current = this.state.route;
    this.setState({dialog: null, overlay: null});
    this.#returnTo = null;
    return this.setRoute(expired ? current : {name: 'login'});
  }

  afterSignIn() {
    const route = this.#returnTo ?? {name: 'dashboard'};
    this.#returnTo = null;
    return this.setRoute(route);
  }

  openDialog(type, props = {}) {
    this.setState({dialog: {type, props, id: ++this.#counter}});
  }

  closeDialog() {
    if (this.state.dialog) this.setState({dialog: null});
  }

  openOverlay(type, props = {}) {
    this.setState({overlay: {type, props, id: ++this.#counter}});
  }

  closeOverlay() {
    if (this.state.overlay) this.setState({overlay: null});
  }

  notify(message) {
    clearTimeout(this.#toastTimer);
    this.setState({toast: {message, id: ++this.#counter}});
    this.#toastTimer = setTimeout(() => this.setState({toast: null}), 5000);
  }

  setOffline(offline) {
    this.setState({offline});
  }
}
