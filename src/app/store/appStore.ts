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
  /** 첫 로그인 진행 단계 메시지 (null = 로딩 아님) */
  loginStep: string | null;

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

// ─── 백그라운드 Drive 동기화 ──────────────────────────────────────────────────
// 기존 사용자 로그인 시 UI 블로킹 없이 Drive 최신 데이터를 로컬에 반영
async function syncDriveInBackground(cachedState: AppState, ym: string): Promise<void> {
  try {
    const driveAppState = await driveAdapter.readAppState();
    const rootFolderId = driveAppState?.currentLedgerRootFolderId
      ?? cachedState.currentLedgerRootFolderId;
    if (rootFolderId !== cachedState.currentLedgerRootFolderId) {
      await driveAdapter.openLedger(rootFolderId);
    }

    await driveAdapter.warmCache(ym);

    const [configEnv, accountsEnv, liabilitiesEnv, txEnv, planEnv] =
      await Promise.allSettled([
        driveAdapter.readConfig(),
        driveAdapter.readAccounts(),
        driveAdapter.readLiabilities(),
        driveAdapter.readTransactions(ym),
        driveAdapter.readBudgetPlan(ym),
      ]);

    const config = configEnv.status === 'fulfilled' ? guardConfig(configEnv.value?.data) : null;
    const accounts = accountsEnv.status === 'fulfilled' ? guardArray<Account>(accountsEnv.value?.data) : null;
    const liabilities = liabilitiesEnv.status === 'fulfilled' ? guardArray<Liability>(liabilitiesEnv.value?.data) : null;

    const update: Partial<{ config: AppConfig; accounts: Account[]; liabilities: Liability[] }> = {};
    if (config) update.config = config;
    if (accounts) update.accounts = accounts;
    if (liabilities) update.liabilities = liabilities;
    if (Object.keys(update).length > 0) useAppStore.setState(update);

    if (txEnv.status === 'fulfilled') {
      const driveTransactions = guardArray<Transaction>(txEnv.value?.data);
      if (driveTransactions.length > 0) await localCache.setTransactions(ym, driveTransactions);
    }
    if (planEnv.status === 'fulfilled' && planEnv.value?.data) saveBudgetPlan(planEnv.value.data);

    const newState: AppState = { ...cachedState, currentLedgerRootFolderId: rootFolderId, lastSyncAt: new Date().toISOString() };
    await Promise.all([
      driveAdapter.writeAppState(newState),
      localCache.setAppState(newState),
      ...(config ? [localCache.setConfig(config)] : []),
      ...(accounts ? [localCache.setAccounts(accounts)] : []),
      ...(liabilities ? [localCache.setLiabilities(liabilities)] : []),
    ]);
  } catch { /* 백그라운드 실패 무시 */ }
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
  loginStep: null,
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
    const ym = currentYM();

    // ── 기존 사용자 빠른 경로 ──────────────────────────────────────────────────
    // localCache에 rootFolderId + config가 있으면 즉시 UI 복원 후 백그라운드 동기화
    const [cachedState, cachedConfig, cachedAccounts, cachedLiabilities] =
      await Promise.all([
        localCache.getAppState(),
        localCache.getConfig(),
        localCache.getAccounts(),
        localCache.getLiabilities(),
      ]);

    const hasCache = !!(cachedState?.currentLedgerRootFolderId && cachedConfig);

    if (hasCache) {
      // 즉시 화면 표시 (Drive API 호출 0회)
      await driveAdapter.openLedger(cachedState!.currentLedgerRootFolderId);
      set({
        isAuthenticated: true,
        config: guardConfig(cachedConfig),
        accounts: cachedAccounts ?? [],
        liabilities: cachedLiabilities ?? [],
        onboardingCompleted: cachedState!.onboardingCompleted,
      });

      // 백그라운드에서 Drive와 동기화 (UI 블로킹 없음)
      syncDriveInBackground(cachedState!, ym).catch(() => {});
      return;
    }

    // ── 신규 사용자 전체 Drive 셋업 ───────────────────────────────────────────
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

    const [configEnv, accountsEnv, liabilitiesEnv, txEnv, planEnv] =
      await Promise.allSettled([
        driveAdapter.readConfig(),
        driveAdapter.readAccounts(),
        driveAdapter.readLiabilities(),
        driveAdapter.readTransactions(ym),
        driveAdapter.readBudgetPlan(ym),
      ]);

    const config =
      configEnv.status === 'fulfilled' ? guardConfig(configEnv.value?.data) : defaultAppConfig;
    const accounts =
      accountsEnv.status === 'fulfilled' ? guardArray<Account>(accountsEnv.value?.data) : [];
    const liabilities =
      liabilitiesEnv.status === 'fulfilled' ? guardArray<Liability>(liabilitiesEnv.value?.data) : [];

    if (txEnv.status === 'fulfilled') {
      const driveTransactions = guardArray<Transaction>(txEnv.value?.data);
      if (driveTransactions.length > 0) await localCache.setTransactions(ym, driveTransactions);
    }
    if (planEnv.status === 'fulfilled' && planEnv.value?.data) saveBudgetPlan(planEnv.value.data);

    set({ loginStep: '거의 다 됐어요!' });
    const onboardingCompleted = driveAppState?.onboardingCompleted ?? false;

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

    set({ isAuthenticated: true, config, onboardingCompleted, accounts, liabilities, loginStep: null });
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
