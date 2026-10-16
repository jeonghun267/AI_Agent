import {createConfigModel} from './config.model.mjs';
import {createAuthModel} from './auth.model.mjs';
import {createClaimModel} from './claim.model.mjs';
import {createAiModel} from './ai.model.mjs';
import {createAccountModel} from './account.model.mjs';

export function createModels(http) {
  return {
    config: createConfigModel(http),
    auth: createAuthModel(http),
    claims: createClaimModel(http),
    ai: createAiModel(http),
    account: createAccountModel(http),
  };
}
