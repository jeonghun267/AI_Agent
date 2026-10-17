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
| `mail/` | 계정 메일 provider 경계(`provider.mjs` 계약), `resend`(Resend REST API, SDK 없음), `console`(개발·시험: 서버 로그에 출력), `disabled`, `messages.mjs`(메일 본문) | 서비스는 발송을 기다리지 않는다. API 키는 `.env`에만 |
| `dev/` | 개발용 데모 계정 seed, 합성 주문서 PDF | 운영에서 seed 금지 |

### 화면 `src/web/` (빌드 도구 없는 ES 모듈)

| 위치 | 역할 | 규칙 |
|---|---|---|
| `main.mjs` | 부트스트랩: HTTP 클라이언트 → Model → ViewModel → View 순서 | |
| `core/` | 공용 도구: `observable`(상태+구독), `http-client`(유일한 fetch), `html`(자동 이스케이프 템플릿), `dom`, `format`, `hash-router`, `preparation`(도리 최소 표시 시간) | |
| `models/` | API 한 곳당 함수 하나. 상태 없음 | DOM·상태 금지 |
| `viewmodels/` | 화면 상태와 명령(`Observable` 상속). 목록 계산은 `select*` 함수. `claim-progress.mjs`에 진행 단계·회수율·**다음 할 일**(`selectNextAction`)·활동 목록, `claim-list.vm.mjs`에 홈 수치·할 일·목록 필터·정렬 | **DOM·window 접근 금지** |
| `views/` | 상태 → HTML(`render`)과 이벤트 → ViewModel 명령(`handlers`) | **fetch·Model 직접 호출 금지** |
| `views/pages/` | 홈(`dashboard`), 클레임 목록(`claims`), 상세(`claim-detail`), 휴지통, 설정, 로그인 화면 | |
| `views/components/` | 여러 화면이 쓰는 조각: 아이콘, 클레임 카드, 다음 할 일 카드, 활동 타임라인, 진행 단계·금액 카드, 단계형 폼(`stepper`), 입력 오류 표시 | |
| `views/app.view.mjs` | 상태가 바뀌면 다시 그리기, 이벤트 위임(click·submit·input·change·파일 끌어 놓기), 다이얼로그·URL 동기화 | |
| `styles/` | `base.css`(토큰·상단 바·하단 탭), `components.css`(공용 조각), `pages.css`(화면 배치), `dori.css` | 숫자 대신 토큰 사용 |

이 규칙 대부분은 `tests/unit/architecture.test.mjs`가 소스를 읽어 강제한다.

**이벤트 연결 규칙**: 각 view 모듈의 `handlers`에서 `click` 키는 `data-action` 이름, `submit` 키는 폼 id, `input`·`change` 키는 요소 id(그 폼의 모든 칸을 받으려면 `form:<폼 id>`), `drop` 키는 `data-drop` 이름이다. 다이얼로그는 열릴 때 한 번만 그리고 상태가 바뀌어도 다시 그리지 않으므로, 열린 폼 안의 실시간 표시(품목 합계, 회수 미리보기, 증빙 대기 목록)는 view가 그 부분만 직접 고친다.

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

## 계정과 메일

- **일회용 링크**(`email_tokens`): 용도는 `verify`(24시간)와 `reset`(30분). 토큰은 SHA-256 해시만 저장한다. 쓰면 그 행을 지우고(`DELETE … RETURNING`이라 두 요청이 같은 링크를 동시에 써도 한 번만 통과), 같은 용도의 새 링크를 만들면 예전 링크를 지운다. 만료·사용됨·없음·용도 다름은 모두 같은 400(`invalid_link`)이다.
- **링크 주소**: `APP_ORIGIN/#/verify/<토큰>`, `APP_ORIGIN/#/reset/<토큰>`. 쿼리 문자열이 아니라 해시 경로라 서버 로그·Referer에 남지 않고, 화면은 쓴 링크를 `history.replaceState`로 지운다.
- **가입**: 바로 로그인되고 인증 메일이 나간다. 인증 전에는 화면 맨 위에 안내 띠와 '인증 메일 다시 받기'(계정당 시간당 3회)가 보인다. 인증하지 않아도 기능은 막지 않는다.
- **비밀번호 재설정 요청**(`POST /api/auth/forgot`): 계정이 있든 없든 같은 응답이다. 시도 제한도 계정이 아니라 요청 수(주소당 시간당 3회, 클라이언트당 10회)로 센다. 계정이 있을 때의 쓰기와 발송은 응답을 보낸 뒤에 해서 응답 시간 차이도 줄인다.
- **비밀번호 재설정**(`POST /api/auth/reset`): 새 비밀번호를 먼저 검증하고(틀리면 링크를 쓰지 않음), 한 트랜잭션에서 비밀번호 변경 → 그 사용자 세션 전부 삭제 → 이메일 인증 처리(링크가 메일함 소유를 증명) → 남은 재설정 링크 삭제. 요청한 브라우저의 쿠키도 지운다.
- **가입 409**: 가입 즉시 로그인되는 흐름이라 이미 가입한 이메일은 409로 알릴 수밖에 없다. IP당 가입 시도 제한(시간당 10회)으로 대량 수집만 늦춘다. 완전히 숨기려면 '메일 링크를 연 뒤 계정 생성' 흐름이 필요하다(README '상용화 전에 남은 일').
- **provider**: `RESEND_API_KEY`가 있으면 `resend`가 기본이다. `POST https://api.resend.com/emails`에 `User-Agent`(없으면 403)와 `Idempotency-Key`를 붙여 보내고, 네트워크 오류·시간 초과·429·5xx면 같은 키로 한 번만 다시 보낸다(두 번 배달되지 않음). 실패는 `mail_*` 코드와 Resend 오류 이름만 로그에 남긴다. 키가 없으면 개발·시험은 `console`(링크를 서버 로그에 출력), 운영은 `disabled`가 되어 `/api/config`의 `mail.enabled`가 false다. 화면은 이 값으로 '비밀번호를 잊었어요' 링크와 인증 띠를 숨긴다. 운영의 `resend`는 `MAIL_FROM`(인증된 도메인)이 있어야 시작한다.

## 새 기능 추가 체크리스트

### 클레임에 새 입력칸

1. `domain/claim.mjs` `parseClaimInput`: 검증 추가
2. 초안 무효 판단에 필요하면 `factualFingerprint`에도 추가
3. `views/dialogs/claim-form.view.mjs`: 알맞은 단계(`basicsFields`·`moneyFields`·`issueFields`)에 입력칸 추가. 수정 폼도 같은 함수를 쓴다. 확인 단계(`renderReview`)에 보여 줄지 정한다
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
| `tests/unit/` | domain 규칙, DB(트리거·탈퇴 삭제), Gemini·Resend provider(가짜 fetch), 화면 순수 로직, 계층 규칙 |
| `tests/http/` | 실제 서버를 임시 DB로 띄워서 보는 API 시험: 가입·세션·CSRF·Host, 이메일 인증·비밀번호 재설정(만료, 재사용 거부, 세션 무효화, 계정 유무 비노출), 사용자 간 격리, 버전 충돌, 재시도 키, 회수 중복, AI 동의·한도·출력 검증, 내보내기·탈퇴 |
| `tests/browser/` | 설치된 Chrome headless로 가입부터 회수 기록까지, 그리고 인증 링크 → 비밀번호 재설정 → 새 비밀번호 로그인까지 진행. 모바일 폭, 외부 요청 0, 스크립트 오류 0 확인 |

HTTP·브라우저 시험은 메일을 보내지 않고 `tests/helpers/app.mjs`의 `createOutbox()`에 모아 링크를 꺼내 쓴다.

`npm run verify`가 이 셋을 순서대로 실행한다.
