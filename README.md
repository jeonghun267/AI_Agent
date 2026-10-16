# ReLo · 해외 직구 클레임 기록

해외 쇼핑몰에서 산 상품의 반품·교환·AS를 **청구 → 판매처 문의 → 답변 → 실제 회수**까지 한 곳에서 기록하는 개인용(B2C) 웹 서비스다.

- **회원가입·로그인**: 각자 자기 클레임만 본다.
- **판매처·통화**: 판매처는 자유롭게 입력한다. 통화는 USD·EUR·GBP·JPY·CNY·KRW·CAD·AUD를 쓸 수 있다.
- **세 가지 금액을 따로 기록**: 청구액, 합의액, 실제로 받은 금액. 판매처의 "환불했다" 통지만으로는 입금으로 치지 않는다.
- **Gemini AI** (사용자가 동의한 경우만):
  - 영문 문의 초안
  - 문제 설명 번역
  - 판매처 답변 번역·분석
  - 주문서 PDF·이미지에서 주문 정보 읽기
- **AI 결과는 미리보기다.** 사용자가 확인하고 저장해야 반영된다.
- **메일은 보내지 않는다.** 앱은 판매처에 메일을 보내지 않는다. 사용자가 복사해서 직접 보내고, "보냈다"는 사실만 기록한다.

## 실행

Node 24.15 이상이 필요하다. 서버 실행에는 추가 패키지가 없다. `npm install`은 브라우저 시험용 `playwright-core`만 설치한다.

```bash
npm install
npm start
```

http://127.0.0.1:4180 을 연다. 개발 모드에서는 데모 계정(`demo@relo.test` / `Demo-Only-2026!`)이 자동으로 만들어진다.

### AI 켜기

`.env.example`을 `.env`로 복사하고 `GEMINI_API_KEY`를 넣는다. 키가 없으면 AI 버튼이 숨겨지고 기본 영문 틀로 동작한다. 자세한 내용은 [docs/AI.md](docs/AI.md)를 본다.

```bash
npm run ai:smoke
```

위 명령은 실제 키로 네 가지 AI 기능을 한 번씩 확인한다.

## 명령

| 명령 | 내용 |
|---|---|
| `npm start` | 서버 실행 (`.env` 자동 적용) |
| `npm run dev` | `src/` 변경 시 자동 재시작 |
| `npm test` | 단위 + HTTP 통합 시험 (네트워크 없이 가짜 AI 사용) |
| `npm run test:browser` | 설치된 Chrome으로 가입부터 회수 기록까지 실제 화면 시험 |
| `npm run verify` | 문법 검사 → 시험 → 브라우저 시험을 순서대로 |
| `npm run check` | 모든 `.mjs` 문법 검사 |
| `npm run ai:smoke` | 실제 Gemini 연결 확인 (API 호출 4회) |
| `npm run backup` | 운영 DB 백업. `-- --verify`를 붙이면 변경 이력 무결성도 검사 |

## 구조

서버는 **라우트 → 서비스 → 리포지토리** 계층이고, 화면은 **View → ViewModel → Model**(MVVM)이다. 폴더 지도, 계층 규칙, 새 기능을 추가하는 순서는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)에 있다.

```
src/server/   Node HTTP 서버 (domain, repositories, services, routes, ai, http)
src/web/      화면 (core, models, viewmodels, views, styles)
tests/        unit, http, browser
docs/         ARCHITECTURE.md, DESIGN.md(디자인 명세), AI.md, archive/(이전 B2B 시제품 기록)
```

## 상용화 전에 남은 일

다음은 아직 구현되지 않았다.

- 이메일 인증, 비밀번호 재설정 (메일 발송 서비스 연동 필요)
- 배포: HTTPS 호스트, 영속 디스크, 외부 백업 보관. `APP_ENV=production`과 `APP_ORIGIN=https://…`를 설정해야 한다
- 이용약관·개인정보처리방침과 국외 이전(Google Gemini) 고지 문구의 법률 검토
- Gemini 유료 등급 전환 (무료 등급은 입력이 모델 개선에 쓰일 수 있다)
- 업로드 파일 악성코드 검사, 결제·구독
- 여러 서버 인스턴스 운영 (로그인 시도 제한이 메모리 기반이라 단일 프로세스 기준이다)
