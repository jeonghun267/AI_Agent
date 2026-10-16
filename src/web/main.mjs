import {createHttpClient} from './core/http-client.mjs';
import {parseHash} from './core/hash-router.mjs';
import {createModels} from './models/index.mjs';
import {createViewModels} from './viewmodels/index.mjs';
import {mountApp} from './views/app.view.mjs';

// Boot order: HTTP client -> Models -> ViewModels -> Views, then load the session.
const http = createHttpClient({onUnauthorized: () => vms.session.expire()});
const models = createModels(http);
const vms = createViewModels(models, http);

mountApp({
  root: document.querySelector('#app'),
  modal: document.querySelector('#modal'),
  overlay: document.querySelector('#overlay'),
  toast: document.querySelector('#toast'),
}, vms);

vms.app.setOffline(!navigator.onLine);
try {
  await vms.session.init();
  await vms.app.setRoute(parseHash(location.hash));
} catch (error) {
  document.querySelector('#app').textContent = `서비스에 연결하지 못했어요. 잠시 후 새로고침해 주세요. (${error.message})`;
}
