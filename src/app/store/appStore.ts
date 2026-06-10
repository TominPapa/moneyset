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
import { saveBudgetPlan, saveRecurringItems, upsertRecurringItem, syncPendingToDrive, migrateLocalDataToDrive } from '../../storage/localPlanStore';
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

  // 정기 항목 (정기지출/구독/할부/자산이동)
  recurringItems: RecurringItem[];
  setRecurringItems: (items: RecurringItem[]) => void;
  /** 자산이동(이체) 실행: from/to 계좌 잔액 업데이트 + 다음 이체일 갱신 */
  executeTransfer: (recurringItemId: string) => Promise<void>;

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
    const monthMode = (cfg.monthMode === 'calendar' || cfg.monthMode === 'payday')
      ? cfg.monthMode
      : defaultAppConfig.monthMode;
    const payday = (typeof cfg.payday === 'number' && cfg.payday >= 1 && cfg.payday <= 31)
      ? cfg.payday
      : defaultAppConfig.payday;

    return {
      ...defaultAppConfig,
      ...cfg,
      monthMode,
      payday,
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
    let email = get().userProfile?.email;

    // 프로필이 아직 로드되지 않은 경우 토큰으로 직접 조회
    // (placeholder 이메일이 DB에 등록되어 인증 자리를 차지하는 문제 방지)
    if (!email) {
      const token = sessionStorage.getItem('__oauth_token__');
      if (token) {
        try {
          const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const p: { name?: string; email?: string; picture?: string } = await r.json();
          if (p.email) {
            email = p.email;
            set({ userProfile: { name: p.name ?? '', email: p.email, picture: p.picture ?? '' } });
          }
        } catch { /* 아래 공통 에러 처리 */ }
      }
    }

    if (!email) {
      throw new Error('구글 계정 정보를 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    }

    try {
      // 1. 서버리스 API 호출 시도 (실시간 중복 체크)
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: normalised, email }),
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

  recurringItems: [],
  setRecurringItems: (items) => set({ recurringItems: items }),
  executeTransfer: async (recurringItemId: string) => {
    const { recurringItems, accounts } = get();
    const item = recurringItems.find((r) => r.id === recurringItemId);
    if (!item || item.kind !== 'transfer') return;

    const fromAccount = accounts.find((a) => a.id === item.fromAccountId);
    const toAccount   = accounts.find((a) => a.id === item.toAccountId);
    if (!fromAccount || !toAccount) return;

    const now = new Date().toISOString();

    // 계좌 잔액 업데이트
    const updatedAccounts = accounts.map((a) => {
      if (a.id === fromAccount.id) return { ...a, balance: a.balance - item.amount, lastUpdatedAt: now };
      if (a.id === toAccount.id)   return { ...a, balance: a.balance + item.amount, lastUpdatedAt: now };
      return a;
    });

    // 다음 이체일 계산
    const cycle = item.transferCycle ?? 'monthly';
    const next = new Date(item.nextDueDate + 'T00:00:00');
    if (cycle === 'monthly') next.setMonth(next.getMonth() + 1);
    else if (cycle === 'weekly') next.setDate(next.getDate() + 7);
    else if (cycle === 'yearly') next.setFullYear(next.getFullYear() + 1);
    const nextDueStr = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;

    const updatedRecurring = recurringItems.map((r) =>
      r.id === recurringItemId ? { ...r, nextDueDate: nextDueStr, updatedAt: now } : r
    );

    // 저장
    const updatedItem = updatedRecurring.find((r) => r.id === recurringItemId)!;
    await upsertRecurringItem(updatedItem);

    await localCache.setAccounts(updatedAccounts);
    driveAdapter.writeAccounts({
      schemaVersion: '1.0',
      fileType: 'accounts.json',
      updatedAt: now,
      revisionHint: crypto.randomUUID(),
      data: updatedAccounts,
    }).catch(() => {});

    set({ accounts: updatedAccounts, recurringItems: updatedRecurring });
  },

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

    // 1) 같은 탭 새로고침: sessionStorage에 토큰이 있으면 바로 복원
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
      set({ isInitialized: true });
      return;
    }

    // 2) 새 탭 / 브라우저 재시작: 이전 로그인 기록이 있으면 silent re-auth 시도
    //    Google 계정에 여전히 로그인 상태이면 사용자 개입 없이 자동 복원됨
    const hasPrevSession = localStorage.getItem('__has_session__') === '1';
    if (hasPrevSession) {
      try {
        const newToken = await driveAdapter.silentReauth();
        await get().login(newToken);
      } catch (silentErr) {
        // 구글 로그아웃 상태거나 재동의 필요 → 로그인 화면 표시
        console.warn('[initApp] Silent re-auth failed, showing login page:', silentErr);
      }
    }

    set({ isInitialized: true });
  },

  // ─── Google OAuth 로그인 후 처리 ──────────────────────────────────────────
  // Drive가 단일 진실 공급원: 항상 Drive에서 최신 데이터를 읽음
  login: async (token: string) => {
    sessionStorage.setItem('__oauth_token__', token);
    // 이전 로그인 기록 저장 → 다음 방문 시 silent re-auth 시도 여부 판단에 사용
    localStorage.setItem('__has_session__', '1');
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
      try {
        const manifest = await driveAdapter.openLedger(driveAppState.currentLedgerRootFolderId);
        rootFolderId = manifest.rootFolderId;
      } catch (folderErr: unknown) {
        const msg = folderErr instanceof Error ? folderErr.message : String(folderErr);
        // 401: 인증 오류 → 재전파하여 로그인 화면으로 이동
        if (msg.includes('401')) throw folderErr;
        // 404·trashed·기타: 기존 장부를 검색하거나 새로 생성
        console.warn('[appStore] Saved ledger folder inaccessible, searching for existing…', msg);
        set({ loginStep: '장부를 다시 찾는 중…' });
        const existing = await driveAdapter.findExistingLedger();
        if (existing) {
          const manifest = await driveAdapter.openLedger(existing);
          rootFolderId = manifest.rootFolderId;
        } else {
          set({ loginStep: '처음 오셨군요! 장부를 만드는 중…' });
          rootFolderId = await driveAdapter.createLedger('RESET Budget');
        }
      }
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
    if (planEnv.status === 'fulfilled') {
      if (planEnv.value?.data) {
        await saveBudgetPlan(planEnv.value.data);
      } else {
        // Drive에 예산 계획이 없음 → 인메모리에 null로 표시 (재조회 방지)
        await localCache.deleteBudgetPlan(ym);
      }
    }
    const driveRecurring: RecurringItem[] =
      recurringEnv.status === 'fulfilled' ? guardArray<RecurringItem>(recurringEnv.value?.data) : [];
    if (driveRecurring.length > 0) {
      await saveRecurringItems(driveRecurring);
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
      recurringItems: driveRecurring,
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
    localStorage.removeItem('__has_session__');

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
