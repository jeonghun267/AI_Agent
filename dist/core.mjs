export const STORE_KEY = 'returndesk.prototype.v1';
export const PHASES = {
  preparing: ['자료 보완', 'amber'], review: ['초안 검토', 'blue'], awaiting: ['답변 대기', 'slate'],
  followup: ['후속 조치', 'blue'], refundPending: ['입금 확인 필요', 'purple'], manual: ['사용자 판단 필요', 'amber'],
  completed: ['처리 완료', 'green'], stopped: ['수동 전환', 'slate']
};
export const GOALS = { return: '반품', exchange: '교환', repair: 'AS' };
export const VENDORS = { anker: 'Anker US', apple: 'Apple US', other: '다른 판매처' };
export const ISSUES = { defective: ['작동 이상', 'The product does not appear to be working as expected.'], damaged: ['상품 파손', 'The product arrived damaged.'], wrong: ['다른 상품 수령', 'The item I received differs from the item ordered.'], changed: ['단순 변심', 'I would like to ask about returning this item.'], other: ['기타', 'I would like assistance with this product.'] };
export const POLICY_DATE = '2026-10-09';
export const POLICIES = {
  apple: {
    title: 'Apple US · Returns & Refunds', url: 'https://www.apple.com/shop/help/returns_refund',
    quote: 'You have 14 calendar days to return an item from the date you received it.',
    summary: '미국 Apple 직접 구매품의 일반 반품은 수령일로부터 14일 조건을 안내합니다. 다른 판매처 구매품은 해당 판매처 정책을 따라야 하며 반품 제외 품목이 있습니다.',
    caution: '구매 국가·구매 경로·제외 품목과 실제 반품 방법을 원문에서 확인하세요. AS 보증 기간이나 교환 가능성을 이 반품 조건으로 확정하지 않습니다.'
  },
  anker: {
    title: 'Anker US · Return and Refund Policy', url: 'https://www.anker.com/policies/refund-policy',
    quote: 'The serial number of the defective item and/or clear visual evidence showing the defect is required.',
    summary: '품질 관련 문의에는 구매 증빙과 일련번호 또는 하자 증빙을 요청합니다. 모델·국가·구매 경로에 따라 조건이 다르며, 제3자 판매처의 반품 정책은 별도로 확인해야 합니다.',
    caution: '원문은 구매 국가 밖으로 이동한 상품과 국제 배송에 보증 제한을 명시합니다. 한국 사용품의 적용 여부를 확정하지 않고 판매처에 확인하는 문의를 준비합니다.'
  }
};
export const REPLY_TYPES = {
  evidence: ['추가 자료 요청', 'preparing'], refund: ['환불 처리 통지', 'refundPending'], accepted: ['교환·AS 후속 처리 안내', 'followup'],
  denied: ['거절 또는 정책 충돌', 'manual'], waiting: ['처리 지연 안내', 'awaiting'], unclear: ['해석·확인이 필요한 답변', 'manual']
};
export function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
export function dateOnly(date = new Date()) { return new Date(date).toISOString().slice(0, 10); }
export function addDays(value, days) { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function logEvent(c, title, detail = '') { c.events.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), title, detail }); c.updatedAt = new Date().toISOString(); }
export function invalidateDraft(c) { c.reviewed = false; c.draftStale = !!c.draft; }
export function isClosed(c) { return c.phase === 'completed' || c.phase === 'stopped'; }
function objectParticle(label) { const code=label.charCodeAt(label.length-1)-0xAC00; return code>=0&&code<11172&&code%28===0?'를':'을'; }
export function missingEvidence(c) { return c.evidence.filter(e => e.required && !e.ready); }
export function applicablePolicy(c) { return c.vendor !== 'other' && c.channel === 'direct'; }
export function deadline(c) {
  if (c.replyDeadline) return { date: c.replyDeadline.date, kind: '판매처 답변 기한', basis: c.replyDeadline.quote, zone: c.replyDeadline.zone, confirmed: true };
  if (c.vendor === 'apple' && c.goal === 'return' && c.channel === 'direct' && c.policyConfirmed && validDate(c.received)) return { date: addDays(c.received, 14), kind: '반품 참고일', basis: `수령일 ${c.received} + 14일 · 원문 및 예외 조건 재확인 필요`, zone: 'America/Los_Angeles', confirmed: false };
  return null;
}
export function nextAction(c) {
  if (c.phase === 'completed') return { title: '처리 결과를 확인했어요', detail: '사용자 확인까지 기록된 사건입니다.', tab: 'history', label: '기록 보기' };
  if (c.phase === 'stopped') return { title: '직접 처리할 수 있도록 기록을 보관했어요', detail: c.stopReason, tab: 'history', label: '중단 기록 보기' };
  if (c.phase === 'refundPending') return { title: '환불 통지 후, 실제 입금을 확인해 주세요', detail: '판매처의 처리 통지만 기록되어 있어요. 카드·은행 내역을 직접 확인한 뒤 종료할 수 있습니다.', tab: 'replies', label: '입금 확인하기' };
  if (c.phase === 'manual') return { title: '다음 조치를 직접 결정해 주세요', detail: '거절·불명확한 답변을 자동으로 성공이나 종료로 바꾸지 않아요.', tab: 'replies', label: '답변 확인하기' };
  if (c.phase === 'awaiting') return { title: '판매처 답변을 기다리고 있어요', detail: '새 답변을 받으면 내용을 추가해 남은 자료와 다음 행동을 갱신하세요.', tab: 'replies', label: '답변 추가하기' };
  if (c.phase === 'followup') return { title: '교환·AS가 실제로 끝났는지 확인해 주세요', detail: '판매처의 안내와 최종 결과 확인을 따로 기록합니다.', tab: 'replies', label: '후속 처리 확인' };
  const missing = missingEvidence(c);
  if (missing.length) return { title: `${missing[0].label}${objectParticle(missing[0].label)} 준비해 주세요`, detail: `필수 자료 ${missing.length}개가 남아 있어요. 보유한 자료를 확인하면 다음 초안을 준비할 수 있습니다.`, tab: 'evidence', label: '자료 확인하기' };
  if (c.draft && !c.draftStale) return { title: '문의 내용과 첨부 자료를 검토해 주세요', detail: '검토를 마친 초안을 복사하고, 직접 제출한 사실을 기록하세요.', tab: 'draft', label: '초안 검토하기' };
  return { title: '자료가 모였어요. 문의 초안을 준비하세요', detail: c.policyConfirmed ? '정책 근거와 사실을 함께 확인하면서 초안을 작성하세요.' : '정책 적용 여부는 아직 미확인입니다. 가능 여부를 묻는 문의부터 준비합니다.', tab: 'draft', label: '초안 준비하기' };
}
export function createCase(data) {
  if (!VENDORS[data.vendor] || !GOALS[data.goal] || !ISSUES[data.issueType]) throw new Error('판매처·요청 조치·문제 유형을 선택해 주세요.');
  if (!data.title?.trim() || !data.issue?.trim()) throw new Error('상품명과 문제 설명을 입력해 주세요.');
  if (!validDate(data.received) || data.received > dateOnly()) throw new Error('수령일은 오늘 또는 이전 날짜로 입력해 주세요.');
  const c = {
    id: crypto.randomUUID(), example: false, vendor: data.vendor, vendorName: (data.vendorName || '').trim().slice(0, 100),
    title: data.title.trim().slice(0, 100), goal: data.goal, received: data.received, channel: ['direct','reseller','unknown'].includes(data.channel) ? data.channel : 'unknown',
    region: ['KR','US','unknown'].includes(data.region) ? data.region : 'unknown', order: (data.order || '').trim().slice(0, 100), issueType: data.issueType,
    issue: data.issue.trim().slice(0, 1500), issueEnglish: (data.issueEnglish || '').trim().slice(0, 1500),
    phase: 'preparing', policyConfirmed: false, draft: '', reviewed: false, draftStale: false, replies: [], events: [], replyDeadline: null, refundNotified: false,
    evidence: [
      { id: 'order', label: '주문 확인서', note: '주문 번호·상품명·구매 경로를 확인할 자료', required: true, ready: false },
      { id: 'photo', label: '문제 확인 사진', note: '문제 부위가 보이는 사진 또는 영상 캡처', required: data.issueType !== 'changed', ready: false },
      { id: 'serial', label: '제품 일련번호', note: '제품 라벨의 번호 또는 해당 라벨 사진 · 추가 요청 시 필수', required: false, ready: false },
      { id: 'package', label: '구성품·포장 사진', note: '구성품과 포장 상태를 확인할 자료', required: false, ready: false }
    ]
  };
  logEvent(c, '사건 접수', `${GOALS[c.goal]} 요청 · 사용자 입력으로 등록`); return c;
}
export function generateDraft(c) {
  if (isClosed(c)) throw new Error('종료된 사건의 초안을 만들 수 없습니다.');
  if (missingEvidence(c).length) throw new Error('필수 자료의 보유 여부를 먼저 확인해 주세요.');
  const request = { return: 'a return', exchange: 'an exchange', repair: 'warranty or repair support' }[c.goal];
  const problem = c.issueEnglish || ISSUES[c.issueType][1];
  const evidence = c.evidence.filter(e => e.ready).map(e => ({order:'Proof of purchase',photo:'Photos of the issue',serial:'Product serial number',package:'Packaging and accessories'}[e.id] || e.label)).join(', ');
  c.draft = `Subject: Request for ${request} — ${c.title}\n\nHello ${VENDORS[c.vendor] === '다른 판매처' ? (c.vendorName || 'Customer') : VENDORS[c.vendor]} Support Team,\n\nI would like to request information about ${request} for ${c.title}.${c.order ? ` My order reference is ${c.order}.` : ' I can provide my order reference through your official support channel.'}\nI received the item on ${c.received}. ${problem}${!c.issueEnglish ? `\nAdditional details provided by me (in Korean): ${c.issue}` : ''}\n\nI have the following supporting materials ready: ${evidence}. I will attach the relevant files when I submit this message myself.\n${c.region === 'KR' ? 'The product is currently in South Korea. Please confirm whether your policy applies to this purchase and location.\n' : ''}${c.policyConfirmed ? '' : 'I have not yet confirmed policy eligibility for my purchase. '}Please confirm the applicable conditions, required evidence, return procedure, and any shipping costs before I proceed.\n\nThank you for your assistance.\n[Your name]`;
  c.reviewed = false; c.draftStale = false; c.phase = 'review'; logEvent(c, '데모 문의 초안 작성', '규칙 기반 영문 틀 사용 · AI 호출 및 자동 번역 없음'); return c;
}
export function approveDraft(c) {
  if (!c.draft.trim() || c.draftStale || missingEvidence(c).length) throw new Error('자료와 최신 초안을 확인한 뒤 검토를 완료해 주세요.');
  c.reviewed = true; logEvent(c, '초안 사용자 검토 완료', '현재 내용에 대한 검토 기록');
}
export function recordSubmission(c) {
  if (!c.reviewed || c.draftStale) throw new Error('현재 초안의 사용자 검토가 필요합니다.');
  if (isClosed(c)) throw new Error('종료된 사건입니다.');
  if (c.phase !== 'review') throw new Error('이미 제출을 기록했거나 새 초안 검토가 필요합니다.');
  c.phase = 'awaiting'; logEvent(c, '직접 제출 사실 기록', c.example ? '예시 제출 단계 진행 · 실제 전송 없음' : '사용자가 제출했다고 확인함 · 이 앱에서 발송하지 않음');
}
export function addReply(c, data) {
  if (isClosed(c)) throw new Error('종료된 사건에는 답변을 추가할 수 없습니다.');
  const text = data.text?.trim();
  if (!text || text.length > 8000 || !REPLY_TYPES[data.type]) throw new Error('답변 내용과 변경 유형을 확인해 주세요.');
  if (c.replies.some(r => r.text === text)) throw new Error('같은 답변이 이미 기록되어 있습니다.');
  if (data.type === 'evidence' && !data.evidenceIds?.length) throw new Error('판매처가 요청한 자료를 선택해 주세요.');
  if (data.deadline && (!validDate(data.deadline) || !data.deadlineQuote?.trim())) throw new Error('기한을 입력할 때는 날짜와 판매처 원문 근거가 필요합니다.');
  if (data.deadline && !['America/Los_Angeles','America/New_York','Asia/Seoul','UTC'].includes(data.zone)) throw new Error('기한의 시간대를 선택해 주세요.');
  const before = PHASES[c.phase][0];
  c.replies.unshift({id:crypto.randomUUID(), at:new Date().toISOString(), text, type:data.type, example:!!data.example});
  c.phase = REPLY_TYPES[data.type][1];
  if (data.type === 'evidence') for (const id of data.evidenceIds) { const evidence = c.evidence.find(e => e.id === id); if (evidence) { evidence.required = true; evidence.ready = false; } }
  if (data.type === 'refund') c.refundNotified = true;
  c.replyDeadline = data.deadline ? {date:data.deadline, quote:data.deadlineQuote.trim().slice(0,500), zone:data.zone} : null;
  invalidateDraft(c);
  logEvent(c, '판매처 답변 반영', `${before} → ${PHASES[c.phase][0]} · 사용자가 선택한 유형: ${REPLY_TYPES[data.type][0]}`); return c;
}
export function completeCase(c, confirmed) {
  if (!confirmed) throw new Error('실제 처리 결과를 직접 확인해야 합니다.');
  if (c.phase === 'refundPending' && !c.refundNotified) throw new Error('환불 통지 기록이 없습니다.');
  if (!['refundPending','followup'].includes(c.phase)) throw new Error('종료 가능한 처리 결과가 아직 없습니다.');
  const detail = c.phase === 'refundPending' ? '사용자가 은행·카드 내역에서 실제 입금을 확인했다고 기록' : '사용자가 교환품 수령 또는 수리 결과를 직접 확인했다고 기록';
  c.phase = 'completed'; logEvent(c, '최종 결과 사용자 확인', detail); return c;
}
export function seedCases() {
  const day = dateOnly();
  const a = createCase({vendor:'anker',title:'Anker 65W 충전기',goal:'return',received:addDays(day,-6),channel:'direct',region:'KR',order:'DEMO-ANK-1024',issueType:'defective',issue:'USB-C 포트에 연결해도 충전이 시작되지 않습니다.',issueEnglish:'Charging does not start when I connect a device to the USB-C port.'});
  a.id='example-anker';a.example=true;
  a.events[0].detail='가상 사건 · 실제 주문·파일·판매처 연락 없음';
  addReply(a,{text:'[예시 답변] Please provide a clear photo of the product serial number so we can check your request.',type:'evidence',evidenceIds:['serial'],example:true});
  a.evidence[0].ready=true;a.evidence[1].ready=true;
  const b = createCase({vendor:'apple',title:'AirPods Pro',goal:'exchange',received:addDays(day,-9),channel:'direct',region:'US',order:'DEMO-APL-0828',issueType:'damaged',issue:'오른쪽 이어버드 외관에 파손이 있습니다.',issueEnglish:'The right earbud arrived with visible damage.'});
  b.id='example-apple';b.example=true;b.evidence.forEach(e=>e.ready=true);b.policyConfirmed=true;generateDraft(b);approveDraft(b);recordSubmission(b);b.events.forEach(e=>e.detail='예시 진행 기록 · 실제 제출 없음');
  const d=createCase({vendor:'anker',title:'Anker MagGo 보조배터리',goal:'return',received:addDays(day,-17),channel:'direct',region:'KR',order:'DEMO-ANK-0731',issueType:'defective',issue:'충전 표시가 켜지지 않습니다.',issueEnglish:'The charging indicator does not turn on.'});
  d.id='example-refund';d.example=true;d.evidence.forEach(e=>e.ready=true);addReply(d,{text:'[예시 답변] Your refund has been processed. Please check your original payment method.',type:'refund',example:true});
  return [a,b,d];
}
export function loadCases(storage) {
  const raw=storage.getItem(STORE_KEY); if (!raw) return {cases:seedCases(), fresh:true};
  const parsed=JSON.parse(raw); if(parsed.version!==1||!Array.isArray(parsed.cases)||parsed.cases.length>100) throw new Error('저장 형식을 확인할 수 없습니다.');
  for(const c of parsed.cases) if(!c||typeof c.id!=='string'||typeof c.title!=='string'||!PHASES[c.phase]||!VENDORS[c.vendor]||!GOALS[c.goal]||!ISSUES[c.issueType]||!Array.isArray(c.evidence)||!Array.isArray(c.events)||!Array.isArray(c.replies)) throw new Error('사건 데이터 형식이 올바르지 않습니다.');
  return {cases:parsed.cases,fresh:false};
}
export function saveCases(storage,cases){storage.setItem(STORE_KEY,JSON.stringify({version:1,cases}));}
