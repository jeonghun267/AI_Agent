# AI (Google Gemini)

## 설정

1. [Google AI Studio](https://aistudio.google.com/)에서 API 키를 만든다.
2. 프로젝트 루트 `.env`에 넣는다. `.env`는 git에 올라가지 않는다.
   ```
   GEMINI_API_KEY=발급받은키
   GEMINI_MODEL=            # 비우면 gemini-3.5-flash-lite
   AI_HOURLY_LIMIT=30       # 사용자 1명이 한 시간에 쓸 수 있는 AI 호출 수
   ```
3. `npm run ai:smoke`로 네 기능을 실제로 한 번씩 호출해 확인한다. (새 클레임의 "주문서로 자동 채우기"는 주문 정보 읽기와 같은 프롬프트를 쓴다.)
4. `npm start`로 서버를 띄운다.

**모델 선택** (2026-10 Google 문서 기준)
- `gemini-3.5-flash-lite`(기본): 새 프로젝트용 저비용 모델로 권장된다.
- `gemini-3.8-flash`: 문장 품질이 더 필요할 때 쓴다.
- `gemini-2.5-*`: 이전에 써 본 계정만 쓸 수 있다.

키가 없으면 `disabled` provider가 쓰인다. 화면에서 AI 버튼이 사라지고, 문의는 기본 영문 틀(`domain/draft-template.mjs`)로 시작한다.

## 기능

| 기능 | API | 보내는 것 | 받는 것 | 프롬프트 |
|---|---|---|---|---|
| 문의 초안 | `POST /api/claims/:id/ai/draft` | 저장된 사건 사실(판매처, 주문번호, 품목, 금액, 문제 설명, 증빙 파일 **이름**, 최근 답변 3개) | 제목·본문(영문), 한국어 요약, 채워야 할 정보 | `ai/prompts/draft.mjs` |
| 문제 설명 번역 | `POST /api/ai/translate-issue` | 입력한 한국어 문장 | 영문 | `ai/prompts/translate.mjs` |
| 답변 분석 | `POST /api/claims/:id/ai/analyze-reply` | 붙여 넣은 판매처 답변 + 사건 요약 | 한국어 번역·요약, 추천 유형, 언급된 금액·기한 | `ai/prompts/translate.mjs` |
| 주문 정보 읽기 | `POST /api/claims/:id/ai/extract` | 선택한 증빙 파일(PDF·이미지) | 판매처, 주문번호, 주문일, 통화, 품목, 원문 인용 | `ai/prompts/extract.mjs` |
| 주문서로 자동 채우기 (새 클레임 1단계) | `POST /api/ai/extract` (파일 원본을 본문으로, 이름은 `X-File-Name`) | 사용자가 고른 주문서 파일(PDF·이미지). 클레임이 아직 없을 때 쓴다 | 위와 같음 | `ai/prompts/extract.mjs` |

**주문서로 자동 채우기**는 업로드와 같은 형식·크기 검사(`checkFile`)를 거친 뒤 파일을 Gemini에 보내고, **서버에는 저장하지 않는다**. 사용 기록(`ai_usage`)은 `claim_id` 없이 남는다. 화면은 읽은 값으로 칸을 채워 보라색으로 표시하고, 그 파일을 4단계 증빙 목록에 넣어 둔다. 증빙은 사용자가 [등록하기]를 누른 뒤 일반 업로드로 저장된다.

각 프롬프트 파일에는 세 가지가 함께 있다.
- `build*Request`: 요청을 만든다. 사용자 데이터는 `<claim_facts>` 같은 태그 안에 넣어서 지시문과 구분한다.
- 응답 스키마(Gemini `responseSchema`)
- `parse*`: 서버에서 응답을 다시 검증하고 이상한 값은 버린다.

## 안전장치

- **동의**: `users.ai_consent_at`이 없으면 `403 ai_consent_required`를 돌려주고, 화면이 동의 창을 띄운다. 설정 화면에서 철회할 수 있다.
- **자동 저장 없음**: AI 응답은 미리보기다. 금액·상태는 사용자가 저장해야 바뀐다. 주문서에서 읽은 합계는 청구액에 넣지 않는다(부분 청구일 수 있음). 새 클레임에서는 품목의 "문제 수량 × 단가" 합계를 [청구액으로 쓰기]로 제안만 한다.
- **보이는 표시**: AI 결과는 보라색 면과 "미리보기" 태그로 보여 주고, AI가 채운 입력칸은 사용자가 고칠 때까지 보라색이다. 답변 분석은 추천 유형을 미리 골라 두고 "추천 다음 행동"을 함께 보여 준다.
- **출력 검증**: 형식이 틀리면 `502 ai_bad_output`. 통화·날짜·금액이 해석되지 않으면 null로 버린다.
- **한도**: 사용자별 시간당 `AI_HOURLY_LIMIT`회. 실패한 호출도 센다.
- **실패 처리**: 네트워크 오류·429·5xx는 1회 재시도하고, 시간 제한은 30초다. 초안 생성이 실패하면 화면이 기본 영문 틀로 대신한다.
- **키 보호**: 키는 `x-goog-api-key` 헤더로만 보낸다. 오류 메시지·로그·응답에 키나 Gemini 응답 본문을 남기지 않는다(`tests/unit/gemini.test.mjs`).

## 비용 확인

모든 호출이 `ai_usage` 표에 남는다.

```sql
SELECT capability, COUNT(*) AS calls, SUM(ok) AS ok,
       SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
FROM ai_usage WHERE created_at >= date('now', '-30 days')
GROUP BY capability;
```

## 새 AI 기능 추가

1. `ai/prompts/새기능.mjs`에 `build*Request`(capability 이름, system, parts, schema)와 `parse*`를 만든다.
2. `services/ai.service.mjs`에 `run(user, claimId, request, parse)`를 쓰는 함수를 추가한다. 동의·한도·기록이 자동으로 적용된다.
3. `routes/ai.routes.mjs`에 경로를, `src/web/models/ai.model.mjs`에 함수를 추가한다.
4. `ai/fake.provider.mjs`에 시험용 응답을 추가하고 `tests/http/ai.test.mjs`에 시험을 쓴다.
5. `scripts/ai-smoke.mjs`에 실제 호출 확인을 한 줄 추가한다.

## 개인정보

AI 기능을 쓰면 위 표의 "보내는 것"이 Google 서버(국외)로 전송된다. 동의 창 문구는 `views/pages/settings.view.mjs`의 `AI_CONSENT_TEXT`에 있다. 상용 운영 전에 다음이 필요하다.
- Gemini **유료 등급**으로 전환. 무료 등급은 입력이 Google의 모델 개선에 쓰일 수 있다.
- 개인정보처리방침의 국외 이전 항목 법률 검토
