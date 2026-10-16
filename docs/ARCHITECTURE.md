# 구조와 규칙

인수인계를 받은 사람이 이 문서 하나로 어디를 고쳐야 하는지 찾을 수 있게 쓴다. 화면 모양과 모션 규칙은 [DESIGN.md](DESIGN.md), AI는 [AI.md](AI.md)를 본다.

## 한눈에 보기

```
브라우저                                          서버 (Node 24, 의존성 없음)
─────────                                        ──────────────────────────
View ──(사용자 행동)──▶ ViewModel ──▶ Model ──fetch──▶ http(app.mjs) ─▶ route ─▶ service ─▶ repository ─▶ SQLite
 ▲                         │                                                  │
 └──── 상태 바뀜 알림 ────────┘                                              domain (순수 규칙)
```

## 폴더 지도

### 서버 `src/server/`

| 위치 | 역할 | 규칙 |
|---|---|---|
| `main.mjs` | 진입점. 설정을 읽고 앱을 띄운다 | |
| `app.mjs` | **조립 지점.** DB·리포지토리·서비스·AI·라우터를 연결하고 요청마다 보안 검사를 한다 | 의존성 주입은 여기 한 곳에서만 |
| `config.mjs` | 환경변수를 읽고 검증한다 | 반환값에 API 키가 있으니 로그로 남기지 말 것 |
| `domain/` | 순수 규칙: 입력 검증, 금액(통화별 최소 단위), 상태 전이, 합계, 회수 기록 규칙, 기본 영문 틀 | **입출력 없음.** `node:crypto` 외 외부 import 금지 |
| `repositories/` | 테이블별 SQL. `db.mjs`는 열기·트랜잭션·마이그레이션 | **SQL은 여기만.** 행을 camelCase 객체로 바꿔 돌려준다 |
| `repositories/migrations/` | `NNN_이름.sql`. 한 번만 순서대로 적용 | 이미 적용된 파일은 고치지 말고 새 파일을 추가 |
| `services/` | 업무 흐름: 권한(본인 것만), 버전 검사, 재시도 키, 감사 기록 | **트랜잭션은 서비스만 연다.** SQL 금지 |
| `routes/` | HTTP ↔ 서비스 변환 | 요청 읽기와 응답 형태만. 리포지토리 import 금지 |
| `http/` | 라우터, 요청·응답 도우미, 보안 헤더·Host·Origin·CSRF, 정적 파일, 시도 제한 | |
| `ai/` | Gemini·가짜·비활성 provider, `prompts/`(프롬프트 + 응답 스키마 + 응답 검증) | AI는 미리보기만 만들고 저장하지 않는다 |
| `dev/` | 개발용 데모 계정 seed, 합성 주문서 PDF | 운영에서 seed 금지 |

### 화면 `src/web/` (빌드 도구 없는 ES 모듈)

| 위치 | 역할 | 규칙 |
|---|---|---|
| `main.mjs` | 부트스트랩: HTTP 클라이언트 → Model → ViewModel → View 순서 | |
| `core/` | 공용 도구: `observable`(상태+구독), `http-client`(유일한 fetch), `html`(자동 이스케이프 템플릿), `dom`, `format`, `hash-router`, `preparation`(도리 최소 표시 시간) | |
| `models/` | API 한 곳당 함수 하나. 상태 없음 | DOM·상태 금지 |
| `viewmodels/` | 화면 상태와 명령(`Observable` 상속). 목록 계산은 `select*` 함수 | **DOM·window 접근 금지** |
| `views/` | 상태 → HTML(`render`)과 이벤트 → ViewModel 명령(`handlers`) | **fetch·Model 직접 호출 금지** |
| `views/app.view.mjs` | 상태가 바뀌면 다시 그리기, 이벤트 위임, 다이얼로그·URL 동기화 | |
| `styles/` | `base.css`(토큰·레이아웃), `components.css`, `dori.css` | 숫자 대신 토큰 사용 |

이 규칙 대부분은 `tests/unit/architecture.test.mjs`가 소스를 읽어 강제한다.

## 요청 하나가 지나가는 길

**예: "판매처 답변 기록"**

1. View(`views/dialogs/reply-form.view.mjs`)
   - 폼 제출 → `handlers.submit['reply-form']` → `vms.detail.recordReply(...)`
2. ViewModel(`viewmodels/claim-detail.vm.mjs`)
   - `recordReply` → `models.claims.recordReply(id, version, reply)`
   - 버전이 충돌하면 최신 값을 다시 불러온 뒤 오류를 넘긴다
3. Model → `core/http-client.mjs`
   - `POST /api/claims/:id/replies`를 보낸다
   - 헤더: `If-Match`(버전), `X-CSRF-Token`
4. 서버 `app.mjs`
   - Host·Origin 검사 → 라우트 찾기 → 세션 확인 → CSRF 검사
5. `routes/inquiry.routes.mjs` → `services/reply.service.mjs`
   - `claims.mutate`가 트랜잭션 안에서 버전 확인 → payload 수정 → 저장 → 감사 기록
6. 응답으로 전체 클레임 보기(`claim.service` `toView`)를 돌려준다
   - ViewModel이 `setState` → View가 다시 그린다

## 데이터

- **소유자 범위**: 모든 표에 `owner_id`가 있고, 모든 조회가 이 값으로 거른다. 다른 사람 것은 404다.
- **클레임**: 사실은 `claims.payload`(JSON)에 둔다. `version`은 매 변경마다 오르고 `If-Match`로 낙관적 잠금을 한다. `data_rev`는 사실이 바뀔 때 올라 예전 문의 초안을 무효(stale)로 만든다.
- **금액**: 통화의 최소 단위 정수다(EUR 39.90 → 3990, JPY 4500 → 4500). 다른 통화를 더하지 않는다.
- **추가만 하는 표**: `ledger`(실제 회수), `drafts`(문의 버전), `audit`(변경 이력)는 DB 트리거로 수정·삭제를 막는다. 잘못된 회수 기록은 정정 항목을 추가해서 고친다. 예외는 회원 탈퇴 때뿐이다(`purges` 표).
- **재시도 키**: 생성·첨부·초안·회수 기록은 `Idempotency-Key`를 받는다. 응답을 못 받고 다시 보내도 한 번만 처리된다.

## 오류 규칙

- 예상된 실패는 모두 `AppError(status, code, message, field?)`로 던진다. 응답 형태는 `{error, message, field?, requestId}`다.
- `message`는 사용자에게 그대로 보여 주는 한국어 문장이다. 무엇을 고치면 되는지 쓴다.
- 입력칸과 관련된 검증은 `forField('입력칸 이름', () => …)`로 감싼다. 그러면 오류에 `field`가 붙는다.
  - 품목은 `items.<번호>.<칸>`처럼 쓴다. 화면은 이 이름을 클레임 폼의 `<칸>-<번호>` 입력칸으로 바꿔서 그 아래에 오류를 띄운다(`views/components/form-feedback.view.mjs`).
  - 새 검증을 추가할 때 입력칸이 정해져 있으면 꼭 `forField`를 쓴다.
- 화면의 느린 요청(AI)은 `AbortController`로 취소할 수 있다. 취소는 `ApiError` code `cancelled`로 온다.

## 새 기능 추가 체크리스트

### 클레임에 새 입력칸

1. `domain/claim.mjs` `parseClaimInput`: 검증 추가
2. 초안 무효 판단에 필요하면 `factualFingerprint`에도 추가
3. `views/dialogs/claim-form.view.mjs`: 입력칸 추가
4. `views/claim-detail/overview.view.mjs`: 표시
5. `tests/unit/domain.test.mjs`와 `tests/http/claims.test.mjs`에 시험 추가

### 새 API

1. 필요하면 `repositories/*.repo.mjs`에 SQL 함수 추가
2. `services/*.service.mjs`에 업무 함수 추가. 변경이면 `claims.mutate` 또는 `withIdempotency` 사용
3. `routes/*.routes.mjs`에 경로 추가. 기본은 로그인 필요, 공개 경로만 `{auth: false}`
4. `src/web/models/*.model.mjs`에 함수 추가
5. `tests/http/`에 시험 추가. 다른 사용자 접근 404 확인을 포함한다

### 새 화면이나 다이얼로그

1. ViewModel에 상태·명령 추가
2. `views/.../*.view.mjs`에 `render`와 `handlers` 작성
3. `views/app.view.mjs`의 `PAGES` / `DIALOGS` / `HANDLERS` 목록에 등록
4. [DESIGN.md](DESIGN.md)의 정렬·모서리·모션 규칙을 따른다

### DB 구조 변경

`repositories/migrations/002_설명.sql`처럼 새 파일을 추가한다. 서버가 시작할 때 한 번 적용된다.

## 시험

| 위치 | 내용 |
|---|---|
| `tests/unit/` | domain 규칙, DB(트리거·탈퇴 삭제), Gemini provider(가짜 fetch), 화면 순수 로직, 계층 규칙 |
| `tests/http/` | 실제 서버를 임시 DB로 띄워서 보는 API 시험: 가입·세션·CSRF·Host, 사용자 간 격리, 버전 충돌, 재시도 키, 회수 중복, AI 동의·한도·출력 검증, 내보내기·탈퇴 |
| `tests/browser/` | 설치된 Chrome headless로 가입부터 회수 기록까지 진행. 모바일 폭, 외부 요청 0, 스크립트 오류 0 확인 |

`npm run verify`가 이 셋을 순서대로 실행한다.
