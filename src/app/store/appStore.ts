// App Store — RESET Budget (Zustand)
// 앱 전역 상태 관리

import { create } from 'zustand';
import type { AppConfig, ThemeMode, Account, Liability, Transaction } from '../../domain/types';
import { defaultAppConfig } from '../../domain/fixtures';
import type { AppState } from '../../storage/driveAdapter';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { localCache } from '../../storage/localCacheImpl';
import { saveBudgetPlan } from '../../storage/localPlanStore';
import { ROUTES } from '../routes';

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

  // 온보딩
  onboardingCompleted: boolean;
  setOnboardingCompleted: (v: boolean) => void;

  // 자산/부채
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;
  liabilities: Liability[];
  setLiabilities: (liabilities: Liability[]) => void;

  // 동기화 상태
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
      // 배열 필드: 값이 없거나 배열이 아닌 경우 기본값으로 복원
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

export const useAppStore = create<AppStore>((set) => ({
  isInitialized: false,

  config: defaultAppConfig,
  setConfig: (config) => set({ config }),
  setTheme: (mode) =>
    set((s) => ({ config: { ...s.config, themeMode: mode } })),

  isAuthenticated: false,
  setAuthenticated: (v) => set({ isAuthenticated: v }),

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

  // ─── 앱 초기화 (localCache 복원) ──────────────────────────────────────────
  initApp: async () => {
    await localCache.init();
    const cached = await localCache.getAppState();
    if (cached) {
      set({ onboardingCompleted: cached.onboardingCompleted });
    }
    set({ isInitialized: true });
  },

  // ─── Google OAuth 로그인 후 처리 ──────────────────────────────────────────
  login: async (token: string) => {
    driveAdapter.setAccessToken(token);

    // 1. Drive appDataFolder에서 AppState 조회
    let driveAppState: AppState | null = null;
    try {
      driveAppState = await driveAdapter.readAppState();
    } catch {
      // appDataFolder 미접근 — 신규 사용자
    }

    // 2. 장부(Ledger) 열기 또는 생성
    let rootFolderId: string;
    if (driveAppState?.currentLedgerRootFolderId) {
      const manifest = await driveAdapter.openLedger(
        driveAppState.currentLedgerRootFolderId,
      );
      rootFolderId = manifest.rootFolderId;
    } else {
      const existing = await driveAdapter.findExistingLedger();
      if (existing) {
        const manifest = await driveAdapter.openLedger(existing);
        rootFolderId = manifest.rootFolderId;
      } else {
        rootFolderId = await driveAdapter.createLedger('RESET Budget');
      }
    }

    // 3~5. Drive에서 config / 자산 / 부채 / 이번달 거래 / 예산계획 병렬 읽기
    const ym = currentYM();
    const [configEnv, accountsEnv, liabilitiesEnv, txEnv, planEnv] =
      await Promise.allSettled([
        driveAdapter.readConfig(),
        driveAdapter.readAccounts(),
        driveAdapter.readLiabilities(),
        driveAdapter.readTransactions(ym),
        driveAdapter.readBudgetPlan(ym),
      ]);

    const config =
      configEnv.status === 'fulfilled'
        ? guardConfig(configEnv.value?.data)
        : defaultAppConfig;

    const accounts =
      accountsEnv.status === 'fulfilled'
        ? guardArray<Account>(accountsEnv.value?.data)
        : [];

    const liabilities =
      liabilitiesEnv.status === 'fulfilled'
        ? guardArray<Liability>(liabilitiesEnv.value?.data)
        : [];

    // Drive → localCache 동기화 (다기기 지원, last-write-wins)
    if (txEnv.status === 'fulfilled') {
      const driveTransactions = guardArray<Transaction>(txEnv.value?.data);
      if (driveTransactions.length > 0) {
        await localCache.setTransactions(ym, driveTransactions);
      }
    }
    if (planEnv.status === 'fulfilled' && planEnv.value?.data) {
      saveBudgetPlan(planEnv.value.data);
    }

    const onboardingCompleted = driveAppState?.onboardingCompleted ?? false;

    // 6. Zustand 상태 갱신
    set({ isAuthenticated: true, config, onboardingCompleted, accounts, liabilities });

    // 7. AppState + config Drive + localCache에 저장
    const newState: AppState = {
      currentLedgerRootFolderId: rootFolderId,
      onboardingCompleted,
      lastOpenedRoute: ROUTES.home,
      localCacheVersion: 1,
      lastSyncAt: new Date().toISOString(),
      installId: driveAppState?.installId ?? crypto.randomUUID(),
    };
    await Promise.all([
      driveAdapter.writeAppState(newState),
      localCache.setAppState(newState),
      localCache.setConfig(config),
      localCache.setAccounts(accounts),
      localCache.setLiabilities(liabilities),
    ]);
  },

  // ─── 로그아웃 ──────────────────────────────────────────────────────────────
  logout: async () => {
    await driveAdapter.signOut();
    set({
      isAuthenticated: false,
      onboardingCompleted: false,
      config: defaultAppConfig,
      accounts: [],
      liabilities: [],
    });
  },
}));
