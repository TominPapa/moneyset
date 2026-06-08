// Routes — RESET Budget
// 스펙 Section 5.1 기준
// Phase 1에서 실제 라우터 및 각 화면 컴포넌트로 교체한다.
// 현재는 라우트 경로 상수와 stub 정의만 포함한다.

// ─── 라우트 경로 상수 ─────────────────────────────────────────────────────────

export const ROUTES = {
  login:            '/login',
  onboarding:       '/onboarding',
  onboardingStep1:  '/onboarding/step1',
  onboardingStep2:  '/onboarding/step2',
  onboardingStep3:  '/onboarding/step3',
  onboardingStep4:  '/onboarding/step4',
  onboardingStep5:  '/onboarding/step5',

  home:             '/',
  record:           '/record',
  budget:           '/budget',      // V1.5 신규
  recurring:        '/recurring',   // V1.5 신규
  debt:             '/debt',
  safety:           '/safety',
  statsMonthly:     '/stats/monthly',
  statsAnnual:      '/stats/annual',
  settlement:       '/settlement',
  reset:            '/reset',
  settings:         '/settings',
  upgrade:          '/upgrade',     // 티어 업그레이드 / 코드 입력
} as const;

export type RoutePath = typeof ROUTES[keyof typeof ROUTES];

// ─── 라우트 메타데이터 ────────────────────────────────────────────────────────

export interface RouteMeta {
  path: RoutePath;
  label: string;
  requiresOnboarding: boolean; // false 면 온보딩 미완료 상태에서도 접근 가능
  showInNav: boolean;          // 하단 네비게이션 바 표시 여부
}

export const routeMeta: RouteMeta[] = [
  { path: ROUTES.login,           label: '로그인',    requiresOnboarding: false, showInNav: false },
  { path: ROUTES.onboarding,      label: '온보딩',    requiresOnboarding: false, showInNav: false },
  { path: ROUTES.onboardingStep1, label: '기본 설정', requiresOnboarding: false, showInNav: false },
  { path: ROUTES.onboardingStep2, label: '자산 등록', requiresOnboarding: false, showInNav: false },
  { path: ROUTES.onboardingStep3, label: '고정지출',  requiresOnboarding: false, showInNav: false },
  { path: ROUTES.onboardingStep4, label: '저축 목표', requiresOnboarding: false, showInNav: false },
  { path: ROUTES.onboardingStep5, label: '예산 확인', requiresOnboarding: false, showInNav: false },

  { path: ROUTES.home,          label: '홈',      requiresOnboarding: true, showInNav: true },
  { path: ROUTES.record,        label: '기록',    requiresOnboarding: true, showInNav: true },
  { path: ROUTES.budget,        label: '예산',    requiresOnboarding: true, showInNav: false },
  { path: ROUTES.recurring,     label: '정기지출', requiresOnboarding: true, showInNav: false },
  { path: ROUTES.debt,          label: '부채관리', requiresOnboarding: true, showInNav: false },
  { path: ROUTES.safety,        label: '안전도',  requiresOnboarding: true, showInNav: true },
  { path: ROUTES.statsMonthly,  label: '통계',    requiresOnboarding: true, showInNav: true },
  { path: ROUTES.settlement,    label: '공동정산', requiresOnboarding: true, showInNav: true },
  { path: ROUTES.reset,         label: '리셋',    requiresOnboarding: true, showInNav: false },
  { path: ROUTES.settings,      label: '설정',    requiresOnboarding: true, showInNav: true },
];
