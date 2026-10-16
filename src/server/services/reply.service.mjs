import {reject, forField} from '../domain/errors.mjs';
import {newId, nowIso} from '../domain/primitives.mjs';
import {cleanText} from '../domain/validation.mjs';
import {REPLY_KINDS, stateAfterReply} from '../domain/claim.mjs';

// Seller replies are pasted by the user. An AI translation/summary may be
// attached, but the reply kind (which drives the state) is always the user's choice.
export function createReplyService({claims}) {
  function record(ownerId, claimId, version, input) {
    const body = cleanText(input.body, 8000);
    forField('body', () => reject(!body, '판매처 답변 원문을 붙여 넣어 주세요.'));
    forField('kind', () => reject(!Object.hasOwn(REPLY_KINDS, input.kind), '답변 유형을 선택하세요.'));
    const reply = {
      id: newId(),
      body,
      kind: input.kind,
      translationKo: cleanText(input.translationKo, 8000),
      summaryKo: cleanText(input.summaryKo, 2000),
      aiAssisted: input.aiAssisted === true,
      recordedAt: nowIso(),
    };
    return claims.mutate(ownerId, claimId, version, '판매처 답변 기록', (payload, row) => {
      payload.replies = [reply, ...(payload.replies ?? [])];
      return {state: stateAfterReply(reply.kind, row.state)};
    }, {factsChanged: true});
  }

  return {record};
}
