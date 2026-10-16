import {createGeminiProvider} from './gemini.provider.mjs';
import {createFakeProvider} from './fake.provider.mjs';
import {createDisabledProvider} from './disabled.provider.mjs';

// Provider contract (every implementation returns this shape):
//   name: string, model: string, enabled: boolean
//   generateJson(request) -> Promise<{data, model, usage: {inputTokens, outputTokens}}>
// request = {capability, system, parts, schema, temperature?, maxOutputTokens?}
//   parts: [{text}] or [{file: {mime, bytes}}]
//   schema: Gemini response schema (OpenAPI subset, uppercase types)
// Failures throw AppError with an ai_* code; never include the API key.
export function createAiProvider(aiConfig) {
  if (aiConfig.provider === 'gemini') return createGeminiProvider(aiConfig);
  if (aiConfig.provider === 'fake') return createFakeProvider();
  return createDisabledProvider();
}
