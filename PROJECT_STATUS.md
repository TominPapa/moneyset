# 머니셋 (MoneySET) — 프로젝트 현황 문서

> **최종 업데이트**: 2026-05-12  
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
| **배포 방식** | GitHub push → Vercel 자동 배포 (vercel.json SPA 리라이트 설정 완료) |
| **개발자 이메일** | jungkiwon7@gmail.com |

### 앱 설명
가계부 + 재무 안전도 분석 앱. Google Drive에 데이터를 저장하고 IndexedDB로 오프라인 캐시. 
텀블벅 크라우드펀딩 진행 중 (2026-05-12 기준 ~18일 남음, 후원자 약 35명).

---

## 2. 기술 스택

```
React 19 + TypeScript (strict) + Vite 8
Zustand 5           — 전역 상태 관리
React Router DOM 7  — 라우팅 + View Transitions API
idb 8               — IndexedDB 래퍼
CSS Modules         — 스타일 (디자인 시스템 V2)
Vitest 4            — 단위 테스트
```

### 저장소 구조
| 레이어 | 기술 | 용도 |
|--------|------|------|
| **클라우드** | Google Drive REST API | 영구 저장 (JSON 파일) |
| **로컬 캐시** | IndexedDB (idb) | 오프라인 우선, 빠른 로딩 |
| **임시 로컬** | localStorage | BudgetPlan, RecurringItem (Drive 동기화 미구현) |

### 환경 변수 (`.env`)
```
VITE_GOOGLE_CLIENT_ID=...  ← Google Cloud Console OAuth 2.0 클라이언트 ID
```

---

## 3. 인증 플로우 (중요 — 모바일 대응 완료)

### 구현 방식: OAuth 2.0 Implicit Flow + Redirect (팝업 미사용)

**문제**: 카카오톡/모바일 브라우저에서 팝업이 차단됨  
**해결**: `window.location.href` 리다이렉트 방식으로 전환

```
1. 사용자가 "Google 계정으로 시작하기" 클릭
2. window.location.href → Google OAuth URL
3. Google이 /#access_token=xxx 로 리다이렉트
4. main.tsx (React 렌더 전): 해시에서 토큰 추출 → sessionStorage 저장 → URL → /login
5. LoginPage: useEffect에서 sessionStorage 토큰 꺼내 login(token) 호출
```

**관련 파일**:
- `src/main.tsx` — 토큰 추출 및 sessionStorage 저장
- `src/pages/auth/LoginPage.tsx` — OAuth redirect 시작 + 토큰 픽업
- `src/app/store/appStore.ts` — `login()` 함수

### 로그인 최적화 (기존 사용자)
- `localCache`에 rootFolderId + config가 있으면 **Drive API 0회 호출**로 즉시 UI 복원
- 이후 `syncDriveInBackground()`에서 백그라운드 동기화

### 신규 사용자 로딩 단계 메시지 (`loginStep`)
```
"Google Drive에 연결하는 중…"
"장부를 준비하는 중…"
"처음 오셨군요! 장부를 만드는 중…"
"데이터를 불러오는 중…"
"거의 다 됐어요!"
```

### Google Cloud Console 설정
- 승인된 JavaScript 원본: `https://moneyset.vercel.app`
- 승인된 리디렉션 URI: `https://moneyset.vercel.app`

---

## 4. Google Drive 파일 구조

```
RESET Budget/              ← rootFolderId (openLedger로 세팅)
├── manifest.json
├── config.json
├── accounts.json
├── liabilities.json
├── months/
│   ├── YYYY-MM.transactions.json
│   └── YYYY-MM.budget-plan.json
├── shared/
│   ├── YYYY-MM.shared-expenses.json
│   └── settlement-transfers.json
├── resets/
│   └── reset-sessions.json
├── reports/
└── backups/

appDataFolder/             ← 앱 전용 숨김 폴더
└── app_state.json         ← onboardingCompleted, rootFolderId 등
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
| 예산 | `/budget` | 카테고리별 예산, 지난달 복사 (V1.5) |
| 정기지출 | `/recurring` | 구독/할부 3탭 + 납부 일정 (V1.5) |
| 안전도 | `/safety` | 260px SVG 링 + 6개 메트릭 카드 |
| 월간 통계 | `/stats/monthly` | 도넛 + 캘린더 히트맵 + 30일 바 차트 |
| 연간 통계 | `/stats/annual` | 연간 그룹 바 차트 + 카테고리 순위 + 안전도 이력 |
| 공동정산 | `/settlement` | 상대방별 미정산 + 정산 처리 |
| 리셋 | `/reset` | 3가지 복귀 모드 (상세/합산/오늘부터) |
| 설정 | `/settings` | 4탭 (일반/카테고리/자산/데이터), CSV/JSON 내보내기 |

### 컴포넌트
| 컴포넌트 | 파일 | 비고 |
|----------|------|------|
| AppShell | `src/components/layout/AppShell.tsx` | 데스크탑 사이드바(232px) + 모바일 하단 탭바 |
| CoachPanel | `src/components/coach/CoachPanel.tsx` | 규칙 기반 AI 코치 팁 |
| Button, Input, Select | `src/components/ui/` | 공용 UI |
| AmountInput | `src/components/ui/AmountInput.tsx` | 원화 포맷 입력 (최대 99억) |
| BottomSheet | `src/components/ui/BottomSheet.tsx` | Portal + @starting-style 슬라이드업 |
| Icons | `src/components/ui/Icons.tsx` | SVG 아이콘 팩토리 (네비게이션 9 + 액션 20 + 카테고리 16) |

---

## 6. 남은 작업 항목

### 🔴 긴급 (배포/공개 품질)

| 항목 | 현재 상태 | 작업 내용 |
|------|-----------|-----------|
| `index.html` 메타 | ✅ 완료 | title, lang, meta description, OG 태그 적용 완료 |
| favicon | Vite 기본 SVG | 머니셋 브랜드 아이콘 교체 |
| 카카오톡 인앱 브라우저 감지 | 미구현 | UA 감지 후 "외부 브라우저로 열기" 안내 배너 |

### 🟡 기능 (미구현)

| 항목 | 현재 상태 | 비고 |
|------|-----------|------|
| **사용자 등급 구분** | 미구현 | 텀블벅 후원자 화이트리스트 or 티어 코드 방식 결정 필요 |
| **사용자 이름/프로필 표시** | 미구현 | Google userinfo API → 사이드바에 이름/이메일 표시 |
| **재무 안전도 공유 카드** | ✅ 완료 | SafetyPage "안전도 카드 저장" 버튼 → Canvas PNG 다운로드 |
| **BudgetPlan/RecurringItem Drive 동기화** | localStorage만 | `localPlanStore.ts`에 `V2 예정` 명시. 디바이스 간 공유 안됨 |
| **PWA 지원** | 미구현 | manifest.json + 아이콘 세트 + (선택) service worker |

### 🟢 개선 여지

| 항목 | 현재 상태 | 비고 |
|------|-----------|------|
| StatsAnnualPage 모바일 CSS | 데스크탑 최적화 | 모바일 레이아웃 점검 필요 |
| AppShell `V2.0` 하드코딩 | 그대로 | 버전 정책 확정 시 수정 |

---

## 7. 비즈니스 / 운영 현황

### 텀블벅 크라우드펀딩
- **상태**: 진행 중 (~18일 남음, 2026-05-12 기준)
- **후원자**: 약 35명
- **과제**: 펀딩 종료 전 트리거 마케팅 필요 (하트/알림 설정자 대상)
- **전략**: 신기능 발표 공지글 → 재방문 유도

### 신기능 발표 후보: 재무 안전도 공유 카드
- 이달의 안전도 점수를 카드 이미지로 생성해 공유
- SNS 바이럴 유도 + 앱 핵심 기능(안전도) 강조
- 구현 범위: `html2canvas` or `canvas API`로 카드 렌더 → 이미지 저장/공유

---

## 8. 도메인 모델 요약

### 핵심 타입 (`src/domain/types.ts`)
```ts
Transaction     — 거래 (income/expense/transfer)
Category        — 카테고리 (icon, entryKind, color)
PaymentMethod   — 결제수단
Account         — 자산 계좌 (checking/savings/investment)
Liability       — 부채 (loan/installment/lease/card_bill)
SharedExpense   — 공동지출
SettlementTransfer — 정산 송금
ResetSession    — 리셋 세션 (blankPeriod, mode, completedAt)
AppConfig       — 앱 설정 전체 (categories, paymentMethods, thresholds 등)
BudgetPlan      — 월별 카테고리 예산 계획
RecurringItem   — 정기지출/구독/할부 항목
FileEnvelope<T> — Drive 파일 래퍼 (schemaVersion, revisionHint 등)
AppState        — appDataFolder 저장 상태 (rootFolderId, onboardingCompleted 등)
```

### 안전도 등급
```
very_safe → safe → warning → risk → critical
```

### 리셋 모드
```
detailed_recovery — 날짜별 거래 하나씩 입력
summary_recovery  — 합산 금액만 기록
restart_today     — 공백 건너뛰고 오늘부터
```

---

## 9. 상태 관리 (Zustand appStore)

```ts
// 주요 상태
isAuthenticated: boolean
loginStep: string | null       // 신규 사용자 로딩 단계 메시지
onboardingCompleted: boolean
config: AppConfig
accounts: Account[]
liabilities: Liability[]
activeMonth: string            // 현재 활성 월 (YYYY-MM)
isSyncing: boolean

// 주요 액션
initApp()   — localCache 복원 (앱 시작 시)
login(token) — OAuth 토큰으로 Drive 연결 + 상태 복원
logout()    — 상태 초기화
```

---

## 10. 라우팅 구조

```
/login                    → LoginPage (RequireNoAuth)
/onboarding/*             → OnboardingProvider 래핑
  /onboarding/step1~5     → 각 Step 페이지 (RequireNotOnboarded)
/                         → AppShell (RequireAuth + RequireOnboarding)
  /                       → HomePage
  /record                 → RecordPage
  /budget                 → BudgetPage
  /recurring              → RecurringPage
  /safety                 → SafetyPage
  /stats/monthly          → StatsMonthlyPage
  /stats/annual           → StatsAnnualPage
  /settlement             → SettlementPage
  /reset                  → ResetPage
  /settings               → SettingsPage
```

---

## 11. 개발 규칙 / 코드 컨벤션

- CSS 변수: V2 페이지는 `--bg-0`, `--mint-500`, `--gold-500`, `--font-display`(Fraunces) 사용
- 구형 V1 페이지는 `--bg-base`, `--bg-card`, `--accent-1` (global.css에서 V2로 매핑됨)
- 모바일 하단 nav 여백: `padding-bottom: calc(var(--space-md) + 68px)`
- Drive 쓰기: `makeEnvelope(fileType, data)` 래퍼 항상 사용
- 거래 저장: `localCache.upsertTransaction` → `driveAdapter.writeTransactions` 순서
- 디바운스 Drive 쓰기: `src/hooks/useDriveSync.ts` (1500ms)

---

## 12. 테스트

```
src/domain/safety.test.ts          — calcSafetySummary, 픽스처 10케이스 + 엣지 6개
src/domain/safetyUtils.test.ts     — getBudgetPeriod, buildSafetyInput 등
src/domain/reset.test.ts           — detectReset, addDays, enumerateDates
src/domain/sharedSettlement.test.ts — calcSplit, calcSharedSettlementSummary 등
```

실행: `npm run test`

---

## 13. 개발 도구

- `src/dev/seedData.ts` — `insertSeedData()`: 3개월 더미 데이터 삽입 / `clearSeedData()`: 전체 초기화
- SettingsPage → 데이터 탭에서 UI로도 seedData 실행 가능
