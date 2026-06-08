// App Store — RESET Budget (Zustand)
// 앱 전역 상태 관리
//
// 스토리지 아키텍처:
//   Drive (단일 진실 공급원) → 인메모리 localCache (세션 캐시) → Zustand (UI 상태)
//
// 로그인 시 항상 Drive에서 최신 데이터를 읽음 (IndexedDB fast path 제거).
// localCache(인메모리)는 세션 중 읽기를 캐시하여 Drive API 호출을 최소화.

import { create } from 'zustand';
import type { AppConfig, ThemeMode, Account, Liability, Transaction } from '../../domain/types';
import { defaultAppConfig } from '../../domain/fixtures';
import type { AppState, UserTier } from '../../storage/driveAdapter';
import { parseTierFromCode } from '../../domain/tiers';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { localCache } from '../../storage/localCacheImpl';
import { saveBudgetPlan, saveRecurringItems, syncPendingToDrive, migrateLocalDataToDrive } from '../../storage/localPlanStore';
import { maybeSaveSnapshot } from '../../storage/backupService';
import type { RecurringItem } from '../../domain/types';
import { ROUTES } from '../routes';
import { getBudgetMonthForDate } from '../../domain/safetyUtils';

interface AppStore {
  // 초기화
  isInitialized: boolean;

  // 설정
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  setTheme: (mode: ThemeMode) => void;

  // 인증
  isAuthenticated: boolean;
  setAuthenticated: (v: boolean) => void;
  /** 로그인 진행 단계 메시지 (null = 로딩 아님) */
  loginStep: string | null;

  // 온보딩
  onboardingCompleted: boolean;
  setOnboardingCompleted: (v: boolean) => void;

  // 자산/부채
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
  liabilities: Liability[];
  setLiabilities: (liabilities: Liability[]) => void;

  // 사용자 프로필 (Google 계정)
  userProfile: { name: string; email: string; picture: string } | null;

  // 사용자 티어
  userTier: UserTier;
  activatedCode: string | null;
  /** 후원 코드 검증 후 티어 업그레이드. 성공 시 새 티어 반환, 실패 시 null */
  unlockWithCode: (code: string) => Promise<UserTier | null>;

  // 동기화 상태 (하위 호환 — 인메모리 아키텍처에서는 isSyncing 항상 false)
  isSyncing: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  setSyncing: (v: boolean) => void;
  setSyncResult: (at: string | null, error: string | null) => void;

  // 현재 활성 월 (YYYY-MM)
  activeMonth: string;
  setActiveMonth: (ym: string) => void;

  // 앱 라이프사이클
  initApp: () => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

function currentYM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Drive 데이터 유효성 보정 헬퍼 ────────────────────────────────────────────

/** Drive에서 읽은 원시 값을 AppConfig로 안전하게 변환. 손상 또는 스키마 불일치 대응. */
function guardConfig(raw: unknown): AppConfig {
  if (raw && typeof raw === 'object') {
    const cfg = raw as Partial<AppConfig>;
    return {
      ...defaultAppConfig,
      ...cfg,
      categories:
        Array.isArray(cfg.categories) && cfg.categories.length > 0
          ? cfg.categories
          : defaultAppConfig.categories,
      fixedExpenses:
        Array.isArray(cfg.fixedExpenses) ? cfg.fixedExpenses : [],
      plannedRequiredExpenses:
        Array.isArray(cfg.plannedRequiredExpenses) ? cfg.plannedRequiredExpenses : [],
      safetyThresholds:
        Array.isArray(cfg.safetyThresholds) && cfg.safetyThresholds.length > 0
          ? cfg.safetyThresholds
          : defaultAppConfig.safetyThresholds,
      paymentMethods:
        Array.isArray(cfg.paymentMethods) && cfg.paymentMethods.length > 0
          ? cfg.paymentMethods
          : defaultAppConfig.paymentMethods,
      counterparties:
        Array.isArray(cfg.counterparties) ? cfg.counterparties : [],
    };
  }
  return defaultAppConfig;
}

/** Drive에서 읽은 원시 값을 배열로 안전하게 변환. */
function guardArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

export const useAppStore = create<AppStore>((set, get) => ({
  isInitialized: false,

  config: defaultAppConfig,
  setConfig: (config) => {
    const today = new Date();
    const newYM = getBudgetMonthForDate(today, config);
    set({ config, activeMonth: newYM });
  },
  setTheme: (mode) =>
    set((s) => ({ config: { ...s.config, themeMode: mode } })),

  isAuthenticated: false,
  loginStep: null,
  setAuthenticated: (v) => set({ isAuthenticated: v }),

  userProfile: null,
  userTier: 'free',
  activatedCode: null,
  unlockWithCode: async (code: string) => {
    const normalised = code.trim().toUpperCase();
    const email = get().userProfile?.email;

    try {
      // 1. 서버리스 API 호출 시도 (실시간 중복 체크)
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: normalised, email: email || 'unknown@example.com' }),
      });

      if (res.ok) {
        const data = await res.json();
        const newTier = data.tier as UserTier;
        if (!newTier) {
          throw new Error('서버 응답에서 올바른 플랜 정보를 받지 못했습니다.');
        }

        const cached = await localCache.getAppState();
        if (cached) {
          const updated: AppState = { ...cached, userTier: newTier, activatedCode: normalised };
          await Promise.all([
            localCache.setAppState(updated),
            driveAdapter.writeAppState(updated),
          ]);
        }
        set({ userTier: newTier, activatedCode: normalised });
        return newTier;
      } else {
        const data = await res.json().catch(() => ({ error: '알 수 없는 서버 오류' }));
        throw new Error(data.error || '인증 코드 검증에 실패했습니다.');
      }
    } catch (err: any) {
      // 서버에서 명시적으로 거절한 한도 초과 오류의 경우, 폴백하지 않고 에러를 화면으로 그대로 전달
      if (err.message && (err.message.includes('초과') || err.message.includes('이미 다른 구글 계정'))) {
        throw err;
      }

      console.warn('API activation failed, falling back to offline check:', err);

      // 2. 오프라인 폴백 검증 (서버리스 통신 장애 또는 로컬 개발 환경용)
      const offlineTier = parseTierFromCode(normalised);
      if (!offlineTier) {
        throw new Error('유효하지 않은 인증 코드입니다. 다시 확인해 주세요.');
      }

      const cached = await localCache.getAppState();
      if (cached) {
        const updated: AppState = { ...cached, userTier: offlineTier, activatedCode: normalised };
        await Promise.all([
          localCache.setAppState(updated),
          driveAdapter.writeAppState(updated),
        ]);
      }
      set({ userTier: offlineTier, activatedCode: normalised });
      return offlineTier;
    }
  },

  onboardingCompleted: false,
  setOnboardingCompleted: (v) =>
    set((s) => ({
      onboardingCompleted: v,
      config: { ...s.config, onboardingCompleted: v },
    })),

  accounts: [],
  setAccounts: (accounts) => set({ accounts }),
  liabilities: [],
  setLiabilities: (liabilities) => set({ liabilities }),

  isSyncing: false,
  lastSyncedAt: null,
  syncError: null,
  setSyncing: (v) => set({ isSyncing: v }),
  setSyncResult: (at, error) => set({ lastSyncedAt: at, syncError: error, isSyncing: false }),

  activeMonth: currentYM(),
  setActiveMonth: (ym) => set({ activeMonth: ym }),

  // ─── 앱 초기화 ────────────────────────────────────────────────────────────
  // 세션 복원 및 초기화
  initApp: async () => {
    await localCache.init(); // no-op
    const token = sessionStorage.getItem('__oauth_token__');
    if (token) {
      try {
        if (!get().isAuthenticated) {
          await get().login(token);
        }
      } catch (err) {
        console.error('Failed to auto login on refresh:', err);
        sessionStorage.removeItem('__oauth_token__');
      }
    }
    set({ isInitialized: true });
  },

  // ─── Google OAuth 로그인 후 처리 ──────────────────────────────────────────
  // Drive가 단일 진실 공급원: 항상 Drive에서 최신 데이터를 읽음
  login: async (token: string) => {
    sessionStorage.setItem('__oauth_token__', token);
    driveAdapter.setAccessToken(token);
    const ym = currentYM();

    // Google 사용자 프로필 비동기 조회 (UI 블로킹 없음)
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((p: { name?: string; email?: string; picture?: string }) => {
        set({ userProfile: { name: p.name ?? '', email: p.email ?? '', picture: p.picture ?? '' } });
      })
      .catch(() => {});

    // ── Drive 셋업 ────────────────────────────────────────────────────────────
    set({ loginStep: 'Google Drive에 연결하는 중…' });
    let driveAppState: AppState | null = null;
    try {
      driveAppState = await driveAdapter.readAppState();
    } catch { /* appDataFolder 미접근 — 신규 사용자 */ }

    set({ loginStep: '장부를 준비하는 중…' });
    let rootFolderId: string;
    if (driveAppState?.currentLedgerRootFolderId) {
      const manifest = await driveAdapter.openLedger(driveAppState.currentLedgerRootFolderId);
      rootFolderId = manifest.rootFolderId;
    } else {
      const existing = await driveAdapter.findExistingLedger();
      if (existing) {
        const manifest = await driveAdapter.openLedger(existing);
        rootFolderId = manifest.rootFolderId;
      } else {
        set({ loginStep: '처음 오셨군요! 장부를 만드는 중…' });
        rootFolderId = await driveAdapter.createLedger('RESET Budget');
      }
    }

    set({ loginStep: '데이터를 불러오는 중…' });
    try { await driveAdapter.warmCache(ym); } catch { /* 무시 */ }

    const [configEnv, accountsEnv, liabilitiesEnv, txEnv, planEnv, recurringEnv] =
      await Promise.allSettled([
        driveAdapter.readConfig(),
        driveAdapter.readAccounts(),
        driveAdapter.readLiabilities(),
        driveAdapter.readTransactions(ym),
        driveAdapter.readBudgetPlan(ym),
        driveAdapter.readRecurringItems(),
      ]);

    const config =
      configEnv.status === 'fulfilled' ? guardConfig(configEnv.value?.data) : defaultAppConfig;
    const accounts =
      accountsEnv.status === 'fulfilled' ? guardArray<Account>(accountsEnv.value?.data) : [];
    const liabilities =
      liabilitiesEnv.status === 'fulfilled' ? guardArray<Liability>(liabilitiesEnv.value?.data) : [];

    // 이번 달 거래를 인메모리 캐시에 선주입 (Drive 재호출 방지)
    if (txEnv.status === 'fulfilled') {
      const driveTransactions = guardArray<Transaction>(txEnv.value?.data);
      await localCache.setTransactions(ym, driveTransactions);
    }
    if (planEnv.status === 'fulfilled' && planEnv.value?.data) {
      await saveBudgetPlan(planEnv.value.data);
    }
    if (recurringEnv.status === 'fulfilled') {
      const driveRecurring = guardArray<RecurringItem>(recurringEnv.value?.data);
      if (driveRecurring.length > 0) {
        await saveRecurringItems(driveRecurring);
      }
    }

    set({ loginStep: '거의 다 됐어요!' });
    const onboardingCompleted = driveAppState?.onboardingCompleted ?? false;

    const newState: AppState = {
      currentLedgerRootFolderId: rootFolderId,
      onboardingCompleted,
      lastOpenedRoute: ROUTES.home,
      localCacheVersion: 1,
      lastSyncAt: new Date().toISOString(),
      installId: driveAppState?.installId ?? crypto.randomUUID(),
      userTier: driveAppState?.userTier ?? 'free',
      activatedCode: driveAppState?.activatedCode,
    };

    // 인메모리 캐시에 주요 데이터 선주입
    await Promise.all([
      localCache.setAppState(newState),
      localCache.setConfig(config),
      localCache.setAccounts(accounts),
      localCache.setLiabilities(liabilities),
    ]);

    // Drive app_state 갱신 (크로스 디바이스 동기화용)
    driveAdapter.writeAppState(newState).catch(() => {});

    const activeMonth = getBudgetMonthForDate(new Date(), config);

    set({
      isAuthenticated: true,
      config,
      activeMonth,
      onboardingCompleted,
      accounts,
      liabilities,
      loginStep: null,
      userTier: driveAppState?.userTier ?? 'free',
      activatedCode: driveAppState?.activatedCode ?? null,
    });

    // 백그라운드 일별 스냅샷 저장 및 펜딩 복구/레거시 마이그레이션 실행
    maybeSaveSnapshot().catch(() => {});
    migrateLocalDataToDrive()
      .then(() => syncPendingToDrive())
      .catch((err) => console.error('Background sync/migration failed:', err));
  },

  // ─── 로그아웃 ──────────────────────────────────────────────────────────────
  logout: async () => {
    await driveAdapter.signOut();
    await localCache.clear(); // 인메모리 데이터 전체 초기화
    sessionStorage.removeItem('__oauth_token__');

    // 로컬 스토리지에 남아있던 캐시 백업 데이터 청소
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('reset-budget:')) {
        localStorage.removeItem(key);
      }
    }

    set({
      isAuthenticated: false,
      onboardingCompleted: false,
      config: defaultAppConfig,
      accounts: [],
      liabilities: [],
      userProfile: null,
      userTier: 'free',
      activatedCode: null,
    });
  },
}));
