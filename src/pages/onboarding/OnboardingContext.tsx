// OnboardingContext — 온보딩 5단계 공유 임시 상태
// Step 5에서 완료 시 Drive/localCache에 한 번에 저장한다.

import { createContext, useContext, useState, useCallback } from 'react';
import type { Account, Liability, ThemeMode, FixedExpenseRule } from '../../domain/types';
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

  const [draft, setDraft] = useState<OnboardingDraft>({
    monthMode: 'calendar',
    payday: 25,
    weekStartDay: 1,
    expectedNetIncomeDefault: 0,
    themeMode: 'noir_black',
    accounts: [],
    liabilities: [],
    savingsTargetDefault: 0,
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
      // 1. AppConfig 구성 (기본값 + draft 덮어쓰기)
      const fixedExpenses = draft.liabilities
        .filter((l) => l.autoFixedExpense)
        .map(liabilityToFixedExpenseRule);

      const config = {
        ...defaultAppConfig,
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
        data: draft.accounts,
      };
      const liabilitiesEnvelope = {
        schemaVersion,
        fileType: 'liabilities.json',
        updatedAt: now,
        revisionHint: crypto.randomUUID(),
        data: draft.liabilities,
      };

      // 2. Drive + localCache 동시 저장
      const cachedState = await localCache.getAppState();
      const newAppState = {
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
        localCache.setAccounts(draft.accounts),
        localCache.setLiabilities(draft.liabilities),
        localCache.setAppState(newAppState),
      ]);

      // 3. Zustand 상태 갱신
      setConfig(config);
      setAccounts(draft.accounts);
      setLiabilities(draft.liabilities);
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
