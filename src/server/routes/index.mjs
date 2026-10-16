import {registerMetaRoutes} from './meta.routes.mjs';
import {registerAuthRoutes} from './auth.routes.mjs';
import {registerClaimRoutes} from './claims.routes.mjs';
import {registerFileRoutes} from './files.routes.mjs';
import {registerInquiryRoutes} from './inquiry.routes.mjs';
import {registerAiRoutes} from './ai.routes.mjs';
import {registerAccountRoutes} from './account.routes.mjs';

export function registerRoutes(router, deps) {
  registerMetaRoutes(router, deps);
  registerAuthRoutes(router, deps);
  registerClaimRoutes(router, deps);
  registerFileRoutes(router, deps);
  registerInquiryRoutes(router, deps);
  registerAiRoutes(router, deps);
  registerAccountRoutes(router, deps);
}
