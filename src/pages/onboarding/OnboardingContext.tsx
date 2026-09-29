// OnboardingContext — 온보딩 5단계 공유 임시 상태
// Step 5에서 완료 시 Drive/localCache에 한 번에 저장한다.

import { createContext, useContext, useState, useCallback } from 'react';
import type { Account, Liability, ThemeMode, FixedExpenseRule, AppConfig } from '../../domain/types';
import { defaultAppConfig } from '../../domain/fixtures';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { localCache } from '../../storage/localCacheImpl';
import { useAppStore } from '../../app/store/appStore';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface OnboardingDraft {
  // Step 1
  monthMode: 'calendar' | 'payday';
  payday: number;
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  expectedNetIncomeDefault: number;
  themeMode: ThemeMode;
  // Step 2
  accounts: Account[];
  // Step 3
  liabilities: Liability[];
  // Step 4
  savingsTargetDefault: number;
}

interface OnboardingContextValue {
  draft: OnboardingDraft;
  updateDraft: (partial: Partial<OnboardingDraft>) => void;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  addLiability: (liability: Liability) => void;
  removeLiability: (id: string) => void;
  complete: () => Promise<void>;
  isCompleting: boolean;
  completeError: string | null;
}

// ─── Liability → FixedExpenseRule 변환 ────────────────────────────────────────

function liabilityToFixedExpenseRule(liability: Liability): FixedExpenseRule {
  return {
    id: `fer_${liability.id}`,
    name: liability.name,
    amount: liability.monthlyAmount,
    dueDay: liability.dueDay,
    categoryId: liability.categoryId,
    isActive: liability.isActive,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const OnboardingCtx = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const setConfig = useAppStore((s) => s.setConfig);
  const setAccounts = useAppStore((s) => s.setAccounts);
  const setLiabilities = useAppStore((s) => s.setLiabilities);
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted);

  // ⚠️ draft 는 반드시 "현재 설정"으로 시드해야 한다.
  // 하드코딩 기본값으로 두면, 기존 사용자가 어떤 이유로든 온보딩에 들어와
  // '다음'만 눌러도 급여일·월 기준·주 시작요일·저축목표·테마가 기본값으로 리셋되어
  // Drive 에 영구 기록된다 (monthMode/payday 는 모든 월별 집계 구간을 바꾼다).
  const existing = useAppStore((s) => s.config);
  // 계좌·부채도 기존 값으로 시드한다. 빈 배열로 두면 Step2/3 에 아무것도 안 보여서
  // 사용자가 이미 있는 계좌를 다시 입력하게 되고, id 가 새로 발급돼 중복 계좌가 생긴다
  // (총자산·고정지출이 이중 계상됨). 시드하면 병합이 id 기준으로 자연히 idempotent 해진다.
  const existingAccounts = useAppStore((s) => s.accounts);
  const existingLiabilities = useAppStore((s) => s.liabilities);
  const [draft, setDraft] = useState<OnboardingDraft>({
    monthMode: existing.monthMode ?? 'calendar',
    payday: existing.payday ?? 25,
    weekStartDay: existing.weekStartDay ?? 1,
    expectedNetIncomeDefault: existing.expectedNetIncomeDefault ?? 0,
    themeMode: existing.themeMode ?? 'noir_black',
    accounts: existingAccounts ?? [],
    liabilities: existingLiabilities ?? [],
    savingsTargetDefault: existing.savingsTargetDefault ?? 0,
  });

  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const updateDraft = useCallback((partial: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const addAccount = useCallback((account: Account) => {
    setDraft((prev) => ({ ...prev, accounts: [...prev.accounts, account] }));
  }, []);

  const removeAccount = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((a) => a.id !== id),
    }));
  }, []);

  const addLiability = useCallback((liability: Liability) => {
    setDraft((prev) => ({ ...prev, liabilities: [...prev.liabilities, liability] }));
  }, []);

  const removeLiability = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      liabilities: prev.liabilities.filter((l) => l.id !== id),
    }));
  }, []);

  const complete = useCallback(async () => {
    setIsCompleting(true);
    setCompleteError(null);
    try {
      // 0. ⚠️ 기존 설정 확인 — 온보딩 재진입으로 인한 데이터 소실 방지
      //
      // 일시적 Drive 장애로 기존 사용자가 온보딩 화면에 들어오는 경우가 있다.
      // 그때 기본값을 그대로 쓰면 사용자가 만든 카테고리·서브카테고리·결제수단·
      // 정산 상대방·안전도 기준이 전부 영구 소실된다.
      // 따라서 저장 전에 반드시 기존 config 를 확인하고, 있으면 병합한다.
      let existingConfig: AppConfig | null = await localCache.getConfig();
      if (!existingConfig) {
        try {
          existingConfig = (await driveAdapter.readConfig())?.data ?? null;
        } catch (readErr) {
          const msg = readErr instanceof Error ? readErr.message : String(readErr);
          // "파일 없음" = 진짜 신규 사용자 → 기본값으로 진행해도 안전
          if (!msg.includes('찾을 수 없습니다')) {
            // 그 외(네트워크·401·rate limit)는 기존 데이터 유무를 알 수 없으므로
            // 덮어쓰지 않고 중단한다. 덮어쓰면 복구 불가.
            throw new Error(
              '기존 설정을 확인하지 못해 저장을 중단했습니다. ' +
              '네트워크 상태를 확인한 뒤 다시 시도해 주세요. ' +
              '(데이터 보호를 위한 조치입니다)',
            );
          }
        }
      }

      // 1. AppConfig 구성 (기본값 ← 기존 설정 ← draft 순으로 덮어쓰기)
      const draftFixedExpenses = draft.liabilities
        .filter((l) => l.autoFixedExpense)
        .map(liabilityToFixedExpenseRule);

      // 기존 고정지출은 유지하고, draft 에서 새로 생긴 것만 추가 (id 기준 중복 제거)
      const existingFixed = existingConfig?.fixedExpenses ?? [];
      const existingFixedIds = new Set(existingFixed.map((f) => f.id));
      const fixedExpenses = [
        ...existingFixed,
        ...draftFixedExpenses.filter((f) => !existingFixedIds.has(f.id)),
      ];

      const config: AppConfig = {
        ...defaultAppConfig,
        // 기존 사용자 데이터(카테고리·결제수단·상대방·안전도 기준 등) 보존
        ...(existingConfig ?? {}),
        // 온보딩에서 사용자가 이번에 입력한 값만 덮어쓴다
        monthMode: draft.monthMode,
        payday: draft.payday,
        weekStartDay: draft.weekStartDay,
        expectedNetIncomeDefault: draft.expectedNetIncomeDefault,
        savingsTargetDefault: draft.savingsTargetDefault,
        themeMode: draft.themeMode,
        fixedExpenses,
        onboardingCompleted: true,
      };

      const now = new Date().toISOString();
      const schemaVersion = '1.0';

      // 계좌·부채: draft 는 기존 항목으로 시드되므로 사용자의 추가·수정·삭제가 모두 반영된
      // 최종 목록이다. 따라서 draft 를 그대로 쓰되, 시드가 되지 않은 예외 상황
      // (draft 는 비었는데 기존 데이터는 있음)에서만 기존 값을 지켜 데이터 소실을 막는다.
      const cachedAccounts = await localCache.getAccounts();
      const cachedLiabilities = await localCache.getLiabilities();
      const mergedAccounts =
        draft.accounts.length === 0 && cachedAccounts.length > 0 ? cachedAccounts : draft.accounts;
      const mergedLiabilities =
        draft.liabilities.length === 0 && cachedLiabilities.length > 0
          ? cachedLiabilities
          : draft.liabilities;

      const configEnvelope = {
        schemaVersion,
        fileType: 'config.json',
        updatedAt: now,
        revisionHint: crypto.randomUUID(),
        data: config,
      };
      const accountsEnvelope = {
        schemaVersion,
        fileType: 'accounts.json',
        updatedAt: now,
        revisionHint: crypto.randomUUID(),
        data: mergedAccounts,
      };
      const liabilitiesEnvelope = {
        schemaVersion,
        fileType: 'liabilities.json',
        updatedAt: now,
        revisionHint: crypto.randomUUID(),
        data: mergedLiabilities,
      };

      // 2. Drive + localCache 동시 저장
      const cachedState = await localCache.getAppState();
      // 기존 app_state 를 통째로 스프레드해 보존 — writeAppState 는 파일 전체를 교체하므로
      // 여기서 빠뜨린 필드(activatedCode 등)는 Drive 에서 영구 삭제된다.
      // 스프레드 방식이라 앞으로 추가되는 필드도 자동 보존된다.
      const newAppState = {
        ...(cachedState ?? {}),
        currentLedgerRootFolderId: cachedState?.currentLedgerRootFolderId ?? '',
        onboardingCompleted: true,
        lastOpenedRoute: '/',
        localCacheVersion: cachedState?.localCacheVersion ?? 1,   // ← 기존 버전 보존 (롤백 방지)
        lastSyncAt: now,
        installId: cachedState?.installId ?? crypto.randomUUID(),
        userTier: cachedState?.userTier ?? 'free',   // ← 기존 tier 보존 (온보딩 재수행 시 초기화 방지)
      };

      await Promise.all([
        driveAdapter.writeConfig(configEnvelope),
        driveAdapter.writeAccounts(accountsEnvelope),
        driveAdapter.writeLiabilities(liabilitiesEnvelope),
        driveAdapter.writeAppState(newAppState),
        localCache.setConfig(config),
        localCache.setAccounts(mergedAccounts),
        localCache.setLiabilities(mergedLiabilities),
        localCache.setAppState(newAppState),
      ]);

      // 3. Zustand 상태 갱신
      setConfig(config);
      setAccounts(mergedAccounts);
      setLiabilities(mergedLiabilities);
      setOnboardingCompleted(true);

      // 4. (setConfig는 step 3에서 이미 호출됨 — 테마 포함)
    } catch (err) {
      setCompleteError(
        err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.',
      );
      throw err;
    } finally {
      setIsCompleting(false);
    }
  }, [draft, setConfig, setAccounts, setLiabilities, setOnboardingCompleted]);

  return (
    <OnboardingCtx.Provider
      value={{
        draft,
        updateDraft,
        addAccount,
        removeAccount,
        addLiability,
        removeLiability,
        complete,
        isCompleting,
        completeError,
      }}
    >
      {children}
    </OnboardingCtx.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingCtx);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
