import {AppViewModel} from './app.vm.mjs';
import {SessionViewModel} from './session.vm.mjs';
import {ClaimListViewModel} from './claim-list.vm.mjs';
import {ClaimDetailViewModel} from './claim-detail.vm.mjs';
import {AiAssistViewModel} from './ai-assist.vm.mjs';
import {DraftViewModel} from './draft.vm.mjs';

// Builds all ViewModels and wires the few cross-references between them.
export function createViewModels(models, http) {
  const session = new SessionViewModel({models, http});
  const list = new ClaimListViewModel({models});
  const detail = new ClaimDetailViewModel({models});
  const app = new AppViewModel({session, list, detail});
  const ai = new AiAssistViewModel({models, session, app});
  const draft = new DraftViewModel({models, app, detail});

  session.onSignedIn = () => app.afterSignIn();
  session.onSignedOut = () => {
    draft.cancel();
    list.setState({claims: []});
    detail.setState({claim: null, upload: null});
    return app.afterSignOut(session.state.expired);
  };

  return {app, session, list, detail, ai, draft};
}
