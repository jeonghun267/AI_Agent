import {reject} from '../domain/errors.mjs';
import {newId, nowIso} from '../domain/primitives.mjs';
import {requireText} from '../domain/validation.mjs';
import {buildDraftRequest, parseDraftResult} from '../ai/prompts/draft.mjs';
import {buildIssueTranslationRequest, parseIssueTranslation, buildReplyAnalysisRequest, parseReplyAnalysis} from '../ai/prompts/translate.mjs';
import {buildExtractRequest, parseExtraction} from '../ai/prompts/extract.mjs';

// AI suggestions only. Nothing here saves to a claim: the user reviews the
// result in the web app and saves it through the normal claim/draft/reply APIs.
export function createAiService({repos, config, claims, files, provider}) {
  function status() {
    return {enabled: provider.enabled, provider: provider.name, model: provider.enabled ? provider.model : null, hourlyLimit: config.ai.hourlyLimit};
  }

  function guard(user) {
    reject(!provider.enabled, 'AI 기능이 아직 설정되지 않았어요. 운영자가 GEMINI_API_KEY를 설정해야 합니다.', 'ai_disabled', 503);
    reject(!user.aiConsentAt, 'AI 기능을 쓰려면 먼저 AI 처리에 동의해 주세요.', 'ai_consent_required', 403);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    reject(repos.aiUsage.countSince(user.id, since) >= config.ai.hourlyLimit,
      `AI 기능은 한 시간에 ${config.ai.hourlyLimit}번까지 쓸 수 있어요. 잠시 후 다시 시도하세요.`, 'ai_rate_limited', 429);
  }

  // Every attempt, failed or not, is recorded for cost tracking and the hourly limit.
  async function run(user, claimId, request, parse) {
    guard(user);
    const usage = {inputTokens: 0, outputTokens: 0};
    try {
      const result = await provider.generateJson(request);
      Object.assign(usage, result.usage);
      const parsed = parse(result.data);
      record(user, claimId, request.capability, usage, true, '');
      return {...parsed, model: result.model};
    } catch (error) {
      record(user, claimId, request.capability, usage, false, error.code || 'error');
      throw error;
    }
  }

  function record(user, claimId, capability, usage, ok, errorCode) {
    repos.aiUsage.insert({
      id: newId(), ownerId: user.id, claimId, capability, model: provider.model,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, ok, errorCode, createdAt: nowIso(),
    });
  }

  async function draft(user, claimId) {
    const claim = claims.detail(user.id, claimId);
    const result = await run(user, claimId, buildDraftRequest(claim), parseDraftResult);
    return {...result, origin: 'ai', notice: 'AI가 쓴 초안이에요. 사실과 다른 내용이나 [확인 필요] 표시가 없는지 확인하고 고쳐 주세요.'};
  }

  async function translateIssue(user, input) {
    const text = requireText(input.text, 3000, '번역할 문제 설명을 입력하세요.');
    return run(user, null, buildIssueTranslationRequest(text), parseIssueTranslation);
  }

  async function analyzeReply(user, claimId, input) {
    const body = requireText(input.body, 8000, '분석할 판매처 답변을 붙여 넣어 주세요.');
    const claim = claims.detail(user.id, claimId);
    return run(user, claimId, buildReplyAnalysisRequest(claim, body), parseReplyAnalysis);
  }

  async function extract(user, claimId, input) {
    const file = files.fileOfClaim(user.id, claimId, input.fileId);
    const result = await run(user, claimId, buildExtractRequest(file), parseExtraction);
    return {...result, source: {fileId: file.id, name: file.name}};
  }

  return {status, draft, translateIssue, analyzeReply, extract};
}
