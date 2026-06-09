# 머니셋 (MoneySET) — 프로젝트 현황 문서

> **최종 업데이트**: 2026-06-09  
> 세션 압축 시 컨텍스트 복원용 기준 문서. 코드 변경 시 이 파일도 함께 업데이트할 것.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **앱 이름** | 머니셋 (MoneySET) / 코드명: RESET Budget |
| **버전** | V2.0 (Design System V2) |
| **배포 URL** | https://moneyset.vercel.app |
| **GitHub** | https://github.com/TominPapa/moneyset.git |
| **로컬 경로** | `D:\Clode_Budget\reset-budget` |
| **배포 방식** | `npx vercel --prod` CLI 직접 배포 (GitHub 자동배포 비활성) |
| **개발자 이메일** | jungkiwon7@gmail.com |

### 앱 설명
가계부 + 재무 안전도 분석 앱. Google Drive에 데이터를 저장하고 인메모리 캐시로 세션 중 속도 최적화.  
텀블벅 크라우드펀딩 **종료 완료** (후원자 약 35명). 현재 실 사용 단계.

---

## 2. 기술 스택

```
React 19 + TypeScript (strict) + Vite 8
Zustand 5           — 전역 상태 관리
React Router DOM 7  — 라우팅 + View Transitions API
CSS Modules         — 스타일 (디자인 시스템 V2)
Vitest 4            — 단위 테스트
ioredis 5           — Vercel Serverless /api/activate 용 Redis 클라이언트
```

### 저장소 구조 (아키텍처 V2 — IndexedDB 제거)
| 레이어 | 기술 | 용도 |
|--------|------|------|
| **클라우드** | Google Drive REST API | 영구 저장 (JSON 파일) — 단일 진실 공급원 |
| **세션 캐시** | 인메모리 Map (`localCacheImpl.ts`) | Drive 자동 조회 + Promise dedup |
| **임시 백업** | localStorage | BudgetPlan/RecurringItem Write-Through 백업 (Drive 오프라인 대비) |

> **IndexedDB 제거**: 동일 계정 다중 창 데이터 불일치 근본 해결. 로그인 시 항상 Drive에서 최신 데이터 읽음.

### 환경 변수 (`.env` / Vercel Production)
```env
VITE_GOOGLE_CLIENT_ID=...   ← Google Cloud Console OAuth 2.0 클라이언트 ID
VITE_SUPPORTER_CODE=...     ← 대표 공용 서포터 코드 (오프라인 폴백용)
VITE_ACCESS_CODES=...       ← 100여 개 텀블벅 후원 코드 매핑 JSON 문자열 (Vercel에만 격리 등록)
REDIS_URL=...               ← Upstash/Official Redis TCP 연결 주소 (중복 등록 제한용)
KV_REST_API_URL=...         ← Upstash Redis REST API 엔드포인트 URL
KV_REST_API_TOKEN=...       ← Upstash Redis REST API 인증 토큰
```

---

## 3. 인증 플로우 및 보안 체계 (중요)

### A. Google OAuth 2.0 로그인
- **구현 방식**: OAuth 2.0 Implicit Flow + Redirect (팝업 미사용)
- 카카오톡 인앱 브라우저나 모바일 환경에서 팝업 차단을 우회하기 위해 `window.location.href` 리다이렉트 방식으로 구현되었습니다.
- 리다이렉트 이후 해시에서 추출한 토큰은 `sessionStorage.__oauth_token__`에 저장됩니다.

### B. 세션 유지 (인메모리 아키텍처 대응)
- `login()` 실행 시 토큰을 `sessionStorage`에 저장
- `initApp()` 앱 시작 시 `sessionStorage` 토큰을 읽어 자동 재로그인 (페이지 새로고침 대응)
- 탭/창 닫기 시 `sessionStorage` 만료 → 재로그인 필요 (정상 동작)
- `logout()` 시 `sessionStorage` + 인메모리 캐시 + localStorage 캐시 전체 초기화

### C. 서포터즈 정품 인증 & 중복 기기 등록 차단 (Vercel Serverless API)
- 사용자가 서포터 코드를 입력하면 프론트엔드는 `/api/activate` API로 인증을 요청합니다.
- **백엔드 검증**:
  1. 전달받은 코드가 Vercel 대시보드 내에 격리 보관되는 `VITE_ACCESS_CODES`에서 로드된 유효한 코드인지 체크하고 티어를 판별합니다.
  2. 판별된 티어에 따라 기기(계정) 제한 한도(`basic` 1대, `couple` 2대)를 확인합니다.
  3. Redis DB(`sponsorship:${code}`)에서 기존 등록된 구글 계정(이메일) 목록을 가져와, 이미 등록된 계정이면 재인증 성공을, 새로운 계정이지만 제한 한도 미만이면 이메일을 등록하고 활성화 성공을, 제한을 초과했으면 400 차단 응답을 보냅니다.
- **보안 무결성 보장**:
  - 깃허브 퍼블릭 저장소에 민감 코드가 노출되지 않도록 서버리스 코드 내 하드코딩 리스트를 완전히 제거했습니다.
  - 빌드된 프론트엔드 JS 번들 파일에 텀블벅 후원 코드가 유출되는 사고를 원천 차단. `src/domain/tiers.ts`에서 개별 코드 파싱을 삭제하고 백엔드 API 단독 검증 구조로 격리. (클라이언트는 오직 공용 대표 코드인 `VITE_SUPPORTER_CODE`만 오프라인 폴백 검증을 지원합니다.)

---

## 4. Google Drive 파일 구조

```
RESET Budget/              ← rootFolderId (openLedger로 세팅)
├── manifest.json
├── config.json
├── accounts.json
├── liabilities.json
├── recurring-items.json
├── months/
│   ├── YYYY-MM.transactions.json
│   └── YYYY-MM.budget.json
├── shared/
│   ├── YYYY-MM.shared-expenses.json
│   └── settlement-transfers.json
├── resets/
│   └── reset-sessions.json
├── reports/
└── backups/
    └── snapshot_YYYY-MM-DD.json  ← 7일치 보관

appDataFolder/             ← 앱 전용 숨김 폴더
└── app_state.json         ← onboardingCompleted, rootFolderId, userTier, activatedCode 등
```

### 파일 ID 캐싱 (성능 최적화)
`DriveAdapterImpl`의 `fileIdCache`, `folderIdCache` (Map)로 중복 API 호출 방지.  
`warmCache(ym)`: 로그인 시 루트 + months 폴더 파일 목록을 2번의 API 호출로 일괄 캐싱.

---

## 5. 전체 페이지 구현 상태

### ✅ 완전 구현 (스텁 없음)

| 페이지 | 경로 | 파일 |
|--------|------|------|
| 로그인 | `/login` | `src/pages/auth/LoginPage.tsx` |
| 온보딩 Step1 | `/onboarding/step1` | 기본 설정 (수입, 월 기준, 주 시작일, 테마) |
| 온보딩 Step2 | `/onboarding/step2` | 자산 등록 (입출금/적금/투자) |
| 온보딩 Step3 | `/onboarding/step3` | 고정지출/부채 등록 |
| 온보딩 Step4 | `/onboarding/step4` | 저축 목표 |
| 온보딩 Step5 | `/onboarding/step5` | 예산 미리보기 + 완료 (Drive 저장) |
| 홈 | `/` | 안전도 링, 카테고리 지출, 주간예산, 현금흐름, 리셋 배너 |
| 기록 | `/record` | 거래 CRUD, 스와이프 삭제, 공동지출, Drive 동기화 |
| 예산 | `/budget` | 카테고리별 예산, 지난달 복사 |
| 정기지출 | `/recurring` | 구독/할부 3탭 + 납부 일정 |
| 안전도 | `/safety` | 260px SVG 링 + 6개 메트릭 카드 |
| 월간 통계 | `/stats/monthly` | 도넛 + 캘린더 히트맵 + 30일 바 차트 |
| 연간 통계 | `/stats/annual` | 연간 그룹 바 차트 + 카테고리 순위 + 안전도 이력 |
| 공동정산 | `/settlement` | 상대방별 미정산 + 정산 처리 |
| 리셋 | `/reset` | 3가지 복귀 모드 (상세/합산/오늘부터) |
| 설정 | `/settings` | 4탭 (일반/카테고리/자산/데이터), CSV/JSON 내보내기, 부채 폼 고도화, 백업/복원 |

### 컴포넌트
| 컴포넌트 | 파일 | 비고 |
|----------|------|------|
| AppShell | `src/components/layout/AppShell.tsx` | 데스크탑 사이드바(232px) + 모바일 하단 탭바 |
| CoachPanel | `src/components/coach/CoachPanel.tsx` | 규칙 기반 AI 코치 팁 |
| Button, Input, Select | `src/components/ui/` | 공용 UI |
| AmountInput | `src/components/ui/AmountInput.tsx` | 원화 포맷 입력 (최대 99억) |
| BottomSheet | `src/components/ui/BottomSheet.tsx` | Portal + @starting-style 슬라이드업 |
| Icons | `src/components/ui/Icons.tsx` | SVG 아이콘 팩토리 |
| InAppBrowserGuard | `src/components/ui/InAppBrowserGuard.tsx` | 인앱 브라우저 감지 및 안내 |

---

## 6. 남은 작업 항목

### 🔴 긴급 (배포/공개 품질)

| 항목 | 현재 상태 | 작업 내용 |
|------|-----------|-----------|
| favicon | Vite 기본 SVG | 머니셋 브랜드 아이콘 교체 |
| Vercel-GitHub 자동배포 | ⚠️ 비활성 | GitHub Integration 재설정 필요 — 현재 `npx vercel --prod` 수동 배포 중 |

### 🟡 기능 (미구현)

| 항목 | 현재 상태 | 비고 |
|------|-----------|------|
| **사용자 이름/프로필 표시** | 미구현 | Google userinfo API → 사이드바에 이름/이메일 표시 |

### 🟢 최근 완료 내역

| 항목 | 상태 | 적용 사항 |
|------|------|-----------|
| **아키텍처 리팩터링** | ✅ 완료 | IndexedDB 제거 → 인메모리 Map + Drive 단일 진실 공급원 |
| **페이지 새로고침 로그인 유지** | ✅ 완료 | sessionStorage 토큰 저장 + initApp 자동 재로그인 |
| **BudgetPlan/RecurringItem Drive 동기화** | ✅ 완료 | localPlanStore.ts 하이브리드 레이어 (debounce 1.5s + pending 복구 + 마이그레이션) |
| **사용자 등급 구분 및 기기 제어** | ✅ 완료 | 서버리스 API + Redis DB를 통한 텀블벅 티어 구분 및 중복 등록 완벽 제어 |
| **인증 시스템 보안 강화** | ✅ 완료 | 깃허브 및 JS 번들 코드 노출 방지를 위해 환경변수 격리 검증 완료 |
| **Payday 예산 주기 매핑 및 이월 버그** | ✅ 완료 | 말일 시점 Date Overflow 해결 및 activeMonth 갱신 로직 보완 |
| **신규 가입자 런타임 크래시 방지** | ✅ 완료 | undefined/NaN payday 주입 시 기본값 폴백 연동으로 Invalid Date 크래시 원천 해결 |
| **일별 스냅샷 백업** | ✅ 완료 | Drive backups/ 폴더에 7일치 보관, 설정 > 데이터 탭에서 복원 가능 |
| **카카오 인앱 브라우저 감지** | ✅ 완료 | UA 감지 후 외부 브라우저로 열기 배너 (LoginPage) |
| **서비스 워커 킬스위치** | ✅ 완료 | 구 PWA 캐시 자동 해제 (public/sw.js + main.tsx) |

---

## 7. 비즈니스 / 운영 현황

### 텀블벅 크라우드펀딩
- **상태**: ✅ 종료 완료
- **후원자**: 약 35명
- **현재**: 후원자 실 사용 단계

### Phase 9 완료: 부채 관리 고도화
- 3가지 상환 방식 자동계산 (원리금균등 / 원금균등 / 만기일시)
- 실제 이자율 반영한 상환 잔액 차트

### 재무 안전도 공유 카드 (✅ 완료)
- 이달의 안전도 점수를 카드 이미지로 생성해 공유
- SafetyPage "안전도 카드 저장" 버튼 → Canvas PNG 다운로드

---

## 8. 도메인 모델 요약

### 핵심 타입 (`src/domain/types.ts`)
```ts
Transaction     — 거래 (income/expense/transfer)
Category        — 카테고리 (icon, entryKind, color)
PaymentMethod   — 결제수단
Account         — 자산 계좌 (checking/savings/investment)
Liability       — 부채 (loan/installment/lease/card_bill)
              └─ repaymentType?: 'annuity' | 'equal_principal' | 'bullet'
              └─ interestRate?: number  (연이율 %)
SharedExpense   — 공동지출
SettlementTransfer — 정산 송금
ResetSession    — 리셋 세션 (blankPeriod, mode, completedAt)
AppConfig       — 앱 설정 전체 (categories, paymentMethods, thresholds 등)
BudgetPlan      — 월별 카테고리 예산 계획
RecurringItem   — 정기지출/구독/할부 항목
FileEnvelope<T> — Drive 파일 래퍼 (schemaVersion, revisionHint 등)
AppState        — appDataFolder 저장 상태 (rootFolderId, onboardingCompleted, userTier, activatedCode 등)
```

---

## 9. 상태 관리 (Zustand appStore)

```ts
// 주요 상태
isAuthenticated: boolean
loginStep: string | null       // 로그인 진행 단계 메시지 (null = 완료)
onboardingCompleted: boolean
config: AppConfig
accounts: Account[]
liabilities: Liability[]
activeMonth: string            // getBudgetMonthForDate(today, config) 기준
userTier: UserTier             // 'free' | 'basic' | 'allinone' | 'couple'
activatedCode: string | null   // 등록된 인증 코드

// 주요 액션
initApp()    — sessionStorage 토큰 읽어 자동 재로그인 (페이지 새로고침 대응)
login(token) — Drive 연결 + 최신 데이터 읽기 + 인메모리 캐시 선주입
logout()     — 인메모리 + sessionStorage + localStorage 전체 초기화
setConfig()  — activeMonth 재계산 포함
```

---

## 10. 라우팅 구조

```
/login                    → LoginPage (RequireNoAuth)
/onboarding/*             → OnboardingProvider 래핑
  /onboarding/step1~5     → 각 Step 페이지 (RequireNotOnboarded)
/                         → AppShell (RequireAuth + RequireOnboarding)
  /                       → HomePage
  /record                 → RecordPage (데스크탑/모바일 분기)
  /budget                 → BudgetPage
  /recurring              → RecurringPage
  /safety                 → SafetyPage
  /stats/monthly          → StatsMonthlyPage
  /stats/annual           → StatsAnnualPage
  /settlement             → SettlementPage
  /reset                  → ResetPage
  /settings               → SettingsPage
  /upgrade                → UpgradePage (free 티어 게이팅)
```

---

## 11. 개발 규칙 / 코드 컨벤션

- CSS 변수: V2 페이지는 `--bg-0`, `--mint-500`, `--gold-500`, `--font-display`(Fraunces) 사용
- 구형 V1 페이지는 `--bg-base`, `--bg-card`, `--accent-1` (global.css에서 V2로 매핑됨)
- 모바일 하단 nav 여백: `padding-bottom: calc(var(--space-md) + 68px)`
- Drive 쓰기: `makeEnvelope(fileType, data)` 래퍼 항상 사용
- 거래 저장: `localCache.upsertTransaction` → `driveAdapter.writeTransactions` 순서
- BudgetPlan/RecurringItem 저장: `localPlanStore.saveBudgetPlan` / `saveRecurringItems` 사용 (debounce Drive 동기화 내장)

---

## 12. 테스트 및 전수 검증

### 테스트 파일 일람
```
src/domain/safety.test.ts          — calcSafetySummary, 픽스처 10케이스 + 엣지 6개
src/domain/safetyUtils.test.ts     — getBudgetPeriod, buildSafetyInput 등
src/domain/reset.test.ts           — detectReset, addDays, enumerateDates
src/domain/sharedSettlement.test.ts — calcSplit, calcSharedSettlementSummary 등
src/domain/tiers.test.ts           — 대표 공용 코드 매칭 & /api/activate API 핸들러 비즈니스 로직 및 중복 한도 검증
src/domain/exhaustive_simulation.test.ts — 365일 * 31개 payday 조합 (11,315개 퍼뮤테이션) 전수 검증
```

실행 명령어: `npm run test` (전체 167개 단위 테스트 정상 완료)
