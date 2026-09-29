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
import { resolveRecurring, advanceByCycle, todayStrLocal } from '../../domain/derivedState';

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
  /** 로그인 실패 사유 (데이터 보호 차단 포함). LoginPage에서 사용자에게 표시 */
  loginError: string | null;
  setLoginError: (v: string | null) => void;
  /** 로그인 실패 종류 — 화면에서 적절한 탈출구를 보여주기 위해 사용.
   *  'ledger_not_found' 일 때만 "새 장부로 시작" 을 제안한다. */
  loginErrorKind: 'ledger_not_found' | 'data_load_failed' | null;
  /** Drive app_state를 이번 세션에서 실제로 읽어냈는가.
   *  false면 메모리의 app_state는 기본값으로 채워진 추정치이므로 Drive에 써서는 안 된다. */
  appStateTrusted: boolean;

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
  /** 인증은 됐지만 Drive에 티어를 저장하지 못한 경우의 경고 (null = 정상).
   *  ⚠️ 여기서 throw 하면 업그레이드 화면에 앱 진입 버튼이 렌더되지 않아
   *  사용자가 /upgrade 에 갇히므로, 실패는 경고로만 전달한다. */
  tierPersistWarning: string | null;
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

/** Drive 읽기 실패가 "파일 없음"(진짜 신규 사용자)인지 "일시적 장애"인지 구분.
 *
 *  ⚠️ 이 구분이 없으면 네트워크 오류·401·rate limit 같은 일시 장애를 신규 사용자로
 *  오인해 기본 설정으로 앱에 진입시키고, 이후 저장 동작이 Drive의 실제 설정
 *  (카테고리·결제수단 등)을 덮어써 영구 소실시킨다. */
function isMissingFileError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('찾을 수 없습니다');
}

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

/** 인증 코드로 얻은 티어를 app_state에 반영.
 *
 *  ⚠️ 메모리의 app_state 가 신뢰할 수 없는 상태(읽기 실패로 기본값이 채워짐)라면
 *  그대로 Drive에 쓰면 안 된다. 원본 installId·onboardingCompleted·활성 코드가
 *  추정치로 덮어써져 영구 파괴되기 때문. 이 경우 Drive 원본을 재조회해 병합하고,
 *  재조회마저 실패하면 Drive 기록을 보류하고 로컬 티어만 갱신한다. */
async function persistTierToAppState(
  tier: UserTier,
  code: string,
  trusted: boolean,
): Promise<{ persisted: boolean }> {
  const cached = await localCache.getAppState();

  if (trusted) {
    if (!cached) return { persisted: false };
    const updated: AppState = { ...cached, userTier: tier, activatedCode: code };
    await localCache.setAppState(updated);
    try {
      await driveAdapter.writeAppState(updated);
      return { persisted: true };
    } catch {
      // 실패를 삼키면 새로고침 시 티어가 free로 되돌아가는데 사용자는 이유를 모른다
      return { persisted: false };
    }
  }

  try {
    // 원본 재조회 성공 시에만 Drive에 기록 (null = 파일이 정말 없음 → 신규 생성 안전)
    const fresh = await driveAdapter.readAppState();
    const base = fresh ?? cached;
    if (base) {
      const updated: AppState = { ...base, userTier: tier, activatedCode: code };
      await localCache.setAppState(updated);
      await driveAdapter.writeAppState(updated);
      return { persisted: true };
    }
    return { persisted: false };
  } catch {
    console.warn('[unlockWithCode] app_state를 신뢰할 수 없어 Drive 기록을 보류했습니다.');
    if (cached) {
      await localCache.setAppState({ ...cached, userTier: tier, activatedCode: code });
    }
    return { persisted: false };
  }
}

/** Drive에 티어를 영속화하지 못했을 때 사용자에게 보여줄 메시지 */
const TIER_NOT_PERSISTED_MSG =
  '인증은 확인됐지만 저장에 실패했습니다. 이 기기에서만 적용된 상태이므로, ' +
  '온라인 상태에서 앱을 다시 열어 주세요. (코드는 이미 등록되어 재사용 가능합니다)';

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
  loginError: null,
  setLoginError: (v) => set({ loginError: v, ...(v === null ? { loginErrorKind: null } : {}) }),
  loginErrorKind: null,
  appStateTrusted: true,
  setAuthenticated: (v) => set({ isAuthenticated: v }),

  userProfile: null,
  userTier: 'free',
  activatedCode: null,
  tierPersistWarning: null,
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

    // 이메일을 끝내 못 받은 경우 (구버전 세션: email 권한 미동의 토큰)
    // 사용자를 막지 않고 오프라인 코드 검증으로 폴백.
    // 서버 등록만 생략되므로 placeholder 이메일이 DB를 오염시키는 일은 없음.
    if (!email) {
      console.warn('[unlockWithCode] 이메일 조회 불가 — 오프라인 코드 검증으로 폴백');
      const offlineTier = parseTierFromCode(normalised);
      if (!offlineTier) {
        throw new Error('유효하지 않은 인증 코드입니다. 다시 확인해 주세요.');
      }
      const r = await persistTierToAppState(offlineTier, normalised, get().appStateTrusted);
      set({
        userTier: offlineTier,
        activatedCode: normalised,
        tierPersistWarning: r.persisted ? null : TIER_NOT_PERSISTED_MSG,
      });
      return offlineTier;
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

        const r = await persistTierToAppState(newTier, normalised, get().appStateTrusted);
        set({
          userTier: newTier,
          activatedCode: normalised,
          tierPersistWarning: r.persisted ? null : TIER_NOT_PERSISTED_MSG,
        });
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

      const r = await persistTierToAppState(offlineTier, normalised, get().appStateTrusted);
      set({
        userTier: offlineTier,
        activatedCode: normalised,
        tierPersistWarning: r.persisted ? null : TIER_NOT_PERSISTED_MSG,
      });
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

    // 다음 이체일 계산 — 경과분을 반영한 유효 이체일에서 1주기 전진
    // (앵커 일자 유지 + 짧은 달 말일 클램프: 1/31 → 2/28 → 3/31, setMonth 오버플로 방지)
    const cycle = item.transferCycle ?? 'monthly';
    const resolved = resolveRecurring(item, todayStrLocal());
    const nextDueStr = advanceByCycle(resolved.nextDueDate, cycle, resolved.anchorDay);

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
        const msg = err instanceof Error ? err.message : String(err);
        // 데이터 로드 실패는 "인증 실패"가 아니다 → 토큰을 버리면 전체 OAuth를
        // 다시 타야 하므로, 토큰을 유지해 즉시 재시도가 가능하게 한다.
        // 단 401(토큰 만료)은 진짜 인증 실패다. 죽은 토큰을 유지하면 새로고침마다
        // 같은 실패가 반복되므로, 데이터 오류로 분류하지 않고 토큰을 폐기한다.
        const isAuthError = msg.includes('401');
        const isDataError =
          !isAuthError && (msg.includes('DATA_LOAD_FAILED') || msg.includes('LEDGER_NOT_FOUND'));
        if (!isDataError) {
          sessionStorage.removeItem('__oauth_token__');
          set({ loginError: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.' });
        } else if (!get().loginError) {
          set({ loginError: msg.replace(/^[A-Z_]+:\s*/, '') });
        }
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
        const msg = silentErr instanceof Error ? silentErr.message : String(silentErr);
        // 데이터 보호로 차단된 경우에는 사유를 사용자에게 알려 재시도를 유도한다
        if ((msg.includes('DATA_LOAD_FAILED') || msg.includes('LEDGER_NOT_FOUND')) && !get().loginError) {
          set({ loginError: msg.replace(/^[A-Z_]+:\s*/, '') });
        }
      }
    }

    set({ isInitialized: true });
  },

  // ─── Google OAuth 로그인 후 처리 ──────────────────────────────────────────
  // Drive가 단일 진실 공급원: 항상 Drive에서 최신 데이터를 읽음
  login: async (token: string) => {
    // "이 기기에서 로그인이 완전히 성공한 적이 있는가" = 기존 사용자 판별의 핵심 근거.
    // ⚠️ 이 플래그는 로그인이 끝까지 성공한 뒤에만 기록해야 한다(맨 아래 참조).
    // 시작 시점에 기록하면, 일시 장애로 중간에 실패했을 때 플래그만 남아
    // 신규 사용자가 "기존 사용자"로 오분류되고 장부 생성이 영구 차단된다.
    const hadPriorSession = localStorage.getItem('__has_session__') === '1';
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
    let appStateReadFailed = false;
    let appStateErrMsg = '';
    try {
      driveAppState = await driveAdapter.readAppState();
    } catch (e) {
      appStateErrMsg = e instanceof Error ? e.message : String(e);
      // ⚠️ 여기서 실패를 "신규 사용자"로 단정하면 안 된다.
      // 일시적 네트워크 오류·401·rate limit과 구분되지 않으므로,
      // 실패 사실을 기록해 두고 아래에서 app_state 덮어쓰기를 차단한다.
      // (덮어쓰면 유료 티어·인증코드가 free로 영구 초기화된다)
      appStateReadFailed = true;
    }

    // ⚠️ app_state 를 읽지 못한 기존 사용자는 티어·인증코드·장부 위치를 알 수 없다.
    // 이 상태로 진행하면 (a) 티어가 free로 강등돼 인증코드 화면으로 튕기고
    // (b) 빈 장부를 새로 만들어 초기 상태처럼 보이며 (c) 이어지는 쓰기가 원본을 파괴한다.
    // 실제 사고가 이 경로로 발생했으므로, 기존 사용자 정황이 있으면 진입을 막는다.
    if (appStateReadFailed && hadPriorSession) {
      // 401(토큰 만료)이면 데이터 문제가 아니라 인증 문제 → 그대로 전파해 재로그인 유도
      if (appStateErrMsg.includes('401')) throw new Error(appStateErrMsg);
      const msg =
        '계정 정보를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요. ' +
        '(데이터 보호를 위해 초기 상태로 진입하지 않습니다)';
      set({ loginStep: null, loginError: msg, loginErrorKind: 'data_load_failed' });
      throw new Error(`DATA_LOAD_FAILED: ${msg}`);
    }

    set({ loginStep: '장부를 준비하는 중…' });

    /** 장부를 새로 만들어도 안전한 상황인지 판정.
     *  기존 사용자에게 빈 장부를 만들어 주면 원본과 분리되어 "전부 초기화" 증상이 된다.
     *
     *  단, 조건을 과하게 좁히면 정당한 신규 사용자가 앱을 영영 쓰지 못하는 락아웃이 된다.
     *  (예: appDataFolder 권한 미동의 → readAppState가 매번 실패 → 영구 차단)
     *  락아웃은 탈출구가 없어 장부 분기보다 더 나쁘므로, "이 기기에서 로그인이 성공한 적이
     *  없고 app_state도 없다"면 생성을 허용한다. hadPriorSession은 로그인 완전 성공 시에만
     *  기록되므로 false는 "정말 처음"을 의미한다. */
    //
    // 사용자가 로그인 화면에서 "새 장부로 시작"을 명시적으로 선택하면 이 플래그가 서고,
    // 그때는 위 판정과 무관하게 장부 생성을 허용한다.
    // (장부 폴더를 실수로 지운 사용자가 앱 안에서 스스로 복구할 유일한 경로다.
    //  Drive 권한이 drive.file 이라 사용자가 손으로 만든 폴더는 앱이 볼 수 없으므로,
    //  이 경로가 없으면 로그인 화면에서 영영 빠져나올 수 없다.)
    // 이 플래그는 "이번 로그인 시도 1회" 에만 유효하다. 읽는 즉시 소비해,
    // 플래그가 남아 다음 로그인에서 사용자 동의 없이 장부가 생성되는 일이 없게 한다.
    const forceNewLedger = localStorage.getItem('__allow_new_ledger__') === '1';
    if (forceNewLedger) localStorage.removeItem('__allow_new_ledger__');

    /** 장부 생성 — 실패하면 사용자의 "새로 시작" 의사를 되살려 둔다.
     *  그러지 않으면 일시 장애로 생성이 실패했을 때 버튼이 사라져,
     *  사용자가 구글 로그인을 처음부터 다시 타야만 버튼을 되찾을 수 있다. */
    const createLedgerOrRearm = async (): Promise<string> => {
      try {
        return await driveAdapter.createLedger('RESET Budget');
      } catch (e) {
        if (forceNewLedger) localStorage.setItem('__allow_new_ledger__', '1');
        throw e;
      }
    };
    const mayCreateLedger = forceNewLedger || (!hadPriorSession && driveAppState == null);
    let createdNewLedger = false;
    const ledgerNotFound = () => {
      const msg =
        '기존 장부를 찾지 못했습니다. Drive의 "RESET Budget" 폴더가 삭제·이동·이름 변경되지 ' +
        '않았는지 확인한 뒤 다시 시도해 주세요. 폴더를 실수로 지웠거나 처음부터 다시 ' +
        '시작하려면 아래 "새 장부로 시작하기"를 눌러 주세요.';
      set({ loginStep: null, loginError: msg, loginErrorKind: 'ledger_not_found' });
      return new Error(`LEDGER_NOT_FOUND: ${msg}`);
    };

    let rootFolderId: string;
    if (driveAppState?.currentLedgerRootFolderId) {
      try {
        const manifest = await driveAdapter.openLedger(driveAppState.currentLedgerRootFolderId);
        rootFolderId = manifest.rootFolderId;
      } catch (folderErr: unknown) {
        const msg = folderErr instanceof Error ? folderErr.message : String(folderErr);
        // 401: 인증 오류 → 재전파하여 로그인 화면으로 이동
        if (msg.includes('401')) throw folderErr;
        // 404·trashed·기타: 기존 장부를 검색 (자동 생성은 하지 않음 — 되돌릴 수 없다)
        console.warn('[appStore] Saved ledger folder inaccessible, searching for existing…', msg);
        set({ loginStep: '장부를 다시 찾는 중…' });
        const existing = await driveAdapter.findExistingLedger();
        if (existing) {
          const manifest = await driveAdapter.openLedger(existing);
          rootFolderId = manifest.rootFolderId;
        } else {
          // 저장된 폴더도 없고 검색으로도 못 찾음 → 사용자가 명시적으로 새로 시작을
          // 선택한 경우에만 생성한다. 그렇지 않으면 원본과 분리된 빈 장부가 생긴다.
          if (!mayCreateLedger) throw ledgerNotFound();
          set({ loginStep: '새 장부를 만드는 중…' });
          rootFolderId = await createLedgerOrRearm();
          createdNewLedger = true;
        }
      }
    } else {
      const existing = await driveAdapter.findExistingLedger();
      if (existing) {
        const manifest = await driveAdapter.openLedger(existing);
        rootFolderId = manifest.rootFolderId;
      } else {
        if (!mayCreateLedger) throw ledgerNotFound();
        set({ loginStep: '처음 오셨군요! 장부를 만드는 중…' });
        rootFolderId = await createLedgerOrRearm();
        createdNewLedger = true;
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

    // ── config 읽기 결과 분류 ────────────────────────────────────────────────
    // "파일 없음"(진짜 신규 사용자) 과 "읽기 실패"(일시 장애) 를 반드시 구분한다.
    const configMissing =
      configEnv.status === 'rejected' && isMissingFileError(configEnv.reason);
    const configReadFailed = configEnv.status === 'rejected' && !configMissing;

    // ── 데이터 소실 방지 가드 ───────────────────────────────────────────────
    // 핵심 파일을 읽지 못한 채 기본값(빈 배열)으로 앱에 진입하면, 이후 어떤 저장
    // 동작이든 Drive 의 실제 데이터(카테고리·계좌·부채·정기지출)를 덮어써 영구 소실된다.
    //
    // accounts/liabilities/recurring 은 readMonoFile 기반이라 "파일 없음"일 때
    // 빈 봉투를 정상 resolve 한다 → rejected 는 100% 실제 장애를 의미하므로
    // 파일 없음 예외 판정 없이 그대로 차단해도 신규 사용자에게 부작용이 없다.
    const criticalReadFailed =
      configReadFailed ||
      accountsEnv.status === 'rejected' ||
      liabilitiesEnv.status === 'rejected' ||
      recurringEnv.status === 'rejected';

    if (criticalReadFailed) {
      const msg =
        '저장된 데이터를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요. ' +
        '(데이터 보호를 위해 초기 상태로 진입하지 않습니다. 저장된 데이터는 안전합니다)';
      set({ loginStep: null, loginError: msg });
      throw new Error(`DATA_LOAD_FAILED: ${msg}`);
    }

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
    // 온보딩 완료 여부는 두 곳(app_state, config)에 기록된다.
    // app_state 읽기가 실패해도 config 로 복구할 수 있어야 기존 사용자가
    // 온보딩으로 되돌아가 설정을 덮어쓰는 사고를 막을 수 있다.
    // 단, 이 장부에 config.json 자체가 없다면(= 이 장부에서 온보딩이 끝난 적이 없다면)
    // 옛 app_state 의 onboardingCompleted=true 를 믿어선 안 된다.
    // createdNewLedger 만으로 판정하면, 지난 로그인에서 만들어졌지만 app_state 에 기록되지
    // 못한 빈 장부를 다음 로그인에서 주워 열 때 가드가 통째로 우회되어
    // 계좌 0개·기본 설정 상태로 홈에 진입하게 된다.
    const onboardingCompleted = (createdNewLedger || configMissing)
      ? false
      : driveAppState?.onboardingCompleted === true || config.onboardingCompleted === true;

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
    // ⚠️ 읽기에 실패했을 때는 절대 쓰지 않는다. 읽지 못한 값(userTier·activatedCode·
    // installId)이 기본값으로 채워진 채 덮어써지면 유료 티어가 free로 영구 초기화된다.
    if (!appStateReadFailed) {
      driveAdapter.writeAppState(newState).catch(() => {});
    } else if (createdNewLedger) {
      // 새 장부를 만들었다면 폴더 ID는 반드시 남겨야 한다(안 그러면 다음 로그인에서 또 헤맨다).
      // 그렇다고 읽지 못한 값을 기본값으로 덮어쓰면 안 되므로, 쓰기 직전에 원본을 한 번 더
      // 읽어 병합한다. 재조회마저 실패하면 기록을 보류한다 —
      // 폴더는 다음 로그인에서 findExistingLedger 로 다시 찾을 수 있지만, 티어는 복구 불가다.
      void (async () => {
        try {
          const fresh = await driveAdapter.readAppState();
          const merged: AppState = fresh
            ? {
                ...fresh,
                currentLedgerRootFolderId: rootFolderId,
                onboardingCompleted,
                lastOpenedRoute: ROUTES.home,
                lastSyncAt: newState.lastSyncAt,
              }
            : newState; // null = 파일이 정말 없음 → 신규 사용자이므로 그대로 기록해도 안전
          await driveAdapter.writeAppState(merged);
        } catch {
          console.warn('[appStore] app_state 재조회 실패 — 새 장부 ID 기록을 보류합니다 (티어 보호)');
        }
      })();
    } else {
      console.warn('[appStore] app_state 읽기 실패 — 덮어쓰기를 건너뜁니다 (티어 보호)');
    }

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
      loginError: null,
      loginErrorKind: null,
      // app_state 를 실제로 읽어냈을 때만 신뢰 — unlockWithCode 등이 이 값을 보고
      // 추정치로 Drive를 덮어쓰지 않도록 한다
      appStateTrusted: !appStateReadFailed,
      userTier: driveAppState?.userTier ?? 'free',
      activatedCode: driveAppState?.activatedCode ?? null,
    });

    // 로그인이 끝까지 성공한 지금에서야 기록한다 (다음 방문 시 silent re-auth 판단 + 기존 사용자 판별)
    //
    // 단, app_state 를 끝내 읽지 못한 채 들어온 경우에는 기록하지 않는다.
    // 기록하면 다음 세션에서 hadPriorSession=true 가 되어 위의 DATA_LOAD_FAILED 가드에 걸리고,
    // app_state 가 만성적으로 읽히지 않는 사용자(파일 손상·appdata 권한 미동의)는
    // 매 세션 "초기화 후 재로그인" 을 반복해야 하는 락아웃 루프에 빠진다.
    if (!appStateReadFailed) {
      localStorage.setItem('__has_session__', '1');
    }

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
      loginError: null,
      appStateTrusted: true,
    });
  },
}));
