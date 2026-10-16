// Calls the real Gemini API once per AI feature with synthetic data and checks
// that each answer passes the same validation the server uses.
//   1. Put GEMINI_API_KEY (and optionally GEMINI_MODEL) in .env
//   2. npm run ai:smoke
// Costs four small API calls. Never prints the key.
import {loadConfig} from '../src/server/config.mjs';
import {createGeminiProvider} from '../src/server/ai/gemini.provider.mjs';
import {buildDraftRequest, parseDraftResult} from '../src/server/ai/prompts/draft.mjs';
import {buildIssueTranslationRequest, parseIssueTranslation, buildReplyAnalysisRequest, parseReplyAnalysis} from '../src/server/ai/prompts/translate.mjs';
import {buildExtractRequest, parseExtraction} from '../src/server/ai/prompts/extract.mjs';
import {fixtureOrderPdf} from '../src/server/dev/fixtures.mjs';

const config = loadConfig();
if (config.ai.provider !== 'gemini') {
  console.error('GEMINI_API_KEY가 설정되지 않았어요. 프로젝트 루트 .env에 GEMINI_API_KEY=... 를 넣은 뒤 다시 실행하세요.');
  process.exit(1);
}

const provider = createGeminiProvider(config.ai);
const claim = {
  title: 'USB-C 허브 7-in-1', vendor: 'Example Gadgets EU', vendorUrl: '', orderRef: 'EG-2026-1001', orderedOn: '2026-10-01',
  kind: 'refund', currency: 'EUR', claimed: 3990, agreed: null,
  items: [{name: 'USB-C Hub 7-in-1', sku: '', orderedQty: 2, claimQty: 1, unitPrice: 3990}],
  issue: '두 개 중 한 개가 전원이 들어오지 않습니다. 다른 노트북과 케이블로도 확인했습니다.', issueEnglish: '',
  files: [{name: 'order-EG-2026-1001.pdf'}], replies: [],
};
const checks = [
  ['문의 초안', buildDraftRequest(claim), parseDraftResult, result => result.body.split('\n')[0]],
  ['문제 설명 번역', buildIssueTranslationRequest(claim.issue), parseIssueTranslation, result => result.english],
  ['답변 분석', buildReplyAnalysisRequest(claim, 'Thanks for reaching out. Please send a photo of the defective unit and its serial number. Once received, we will refund EUR 39.90 within 5 business days.'),
    parseReplyAnalysis, result => `${result.suggestedKind} / ${result.summaryKo}`],
  ['주문서 PDF 추출', buildExtractRequest({mime: 'application/pdf', bytes: fixtureOrderPdf()}), parseExtraction,
    result => JSON.stringify({...result.suggestion, orderTotal: result.orderTotal})],
];

console.log(`Gemini model: ${config.ai.model}\n`);
let failed = 0;
for (const [label, request, parse, describe] of checks) {
  const started = Date.now();
  try {
    const answer = await provider.generateJson(request);
    const result = parse(answer.data);
    console.log(`✔ ${label} (${Date.now() - started}ms, 입력 ${answer.usage.inputTokens} / 출력 ${answer.usage.outputTokens} 토큰)\n  ${describe(result).slice(0, 200)}`);
  } catch (error) {
    failed += 1;
    console.log(`✖ ${label}: ${error.code ?? 'error'} ${error.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
