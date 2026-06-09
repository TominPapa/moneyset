// safetyUtils.ts — RESET Budget
// 실제 앱 데이터에서 SafetyInput / AssetSummary 를 도출하는 순수 헬퍼 함수

import type { Transaction, AppConfig, Account, Liability, AssetSummary, RecurringItem } from './types';
import type { SafetyInput } from './safety';

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────

/** Date → "YYYY-MM-DD" (로컬 시간 기준, toISOString() 의 UTC 변환 오류 방지) */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 두 날짜 사이의 일수 (a → b, 양수) */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const aMs = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bMs = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bMs - aMs) / msPerDay);
}

// ─── 예산 기간 ────────────────────────────────────────────────────────────────

/**
 * y년 m월(0-indexed)의 p일에 해당하는 안전한 Date 객체를 반환한다.
 * 만약 p가 해당 월의 말일보다 크다면, 말일로 제한(clamp)한다.
 * 예: 2026년 2월(m=1)의 30일 -> 2026-02-28
 */
export function getSafeDate(y: number, m: number, p: number): Date {
  const safeP = (typeof p === 'number' && !Number.isNaN(p)) ? p : 25;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const safeDay = Math.min(safeP, lastDay);
  return new Date(y, m, safeDay);
}

/**
 * 오늘 날짜와 AppConfig 를 바탕으로 현재 예산 기간의 시작/끝을 반환한다.
 * - calendar 모드: 해당 달의 1일 ~ 말일
 * - payday 모드: 지난 달 급여일 ~ 이번 달 급여일 전날 (또는 이번 달 급여일 ~ 다음 달 급여일 전날)
 */
export function getBudgetPeriod(
  today: Date,
  config: Pick<AppConfig, 'monthMode' | 'payday'>,
): { start: Date; end: Date } {
  const mode = config?.monthMode ?? 'calendar';
  const payday = config?.payday ?? 25;

  if (mode === 'calendar') {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    };
  }

  // payday 모드
  const p = payday;
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed
  const d = today.getDate();

  // 이번 달의 실제 급여일 구하기 (clamp 적용)
  const currentPaydayDate = getSafeDate(y, m, p);
  const currentPayday = currentPaydayDate.getDate();

  if (d >= currentPayday) {
    // 이번 달 급여일 ~ 다음 달 급여일 전날
    const start = getSafeDate(y, m, p);
    const end = getSafeDate(y, m + 1, p);
    end.setDate(end.getDate() - 1);
    return { start, end };
  } else {
    // 지난 달 급여일 ~ 이번 달 급여일 전날
    const start = getSafeDate(y, m - 1, p);
    const end = getSafeDate(y, m, p);
    end.setDate(end.getDate() - 1);
    return { start, end };
  }
}

/**
 * activeMonth ("YYYY-MM") 기준 해당 예산 기간의 시작/끝 날짜 반환
 */
export function getBudgetPeriodForMonth(
  ym: string,
  config: Pick<AppConfig, 'monthMode' | 'payday'>,
): { start: Date; end: Date } {
  const [y, m] = ym.split('-').map(Number);
  const mode = config?.monthMode ?? 'calendar';
  const payday = config?.payday ?? 25;

  if (mode === 'calendar') {
    return {
      start: new Date(y, m - 1, 1),
      end: new Date(y, m, 0),
    };
  }

  // payday 모드
  const p = payday;
  const start = getSafeDate(y, m - 2, p);
  const end = getSafeDate(y, m - 1, p);
  end.setDate(end.getDate() - 1);
  return { start, end };
}

/**
 * 주어진 날짜(기본값: 오늘)와 AppConfig를 바탕으로 해당하는 예산 기준 월(YYYY-MM)을 반환한다.
 */
export function getBudgetMonthForDate(
  date: Date,
  config: Pick<AppConfig, 'monthMode' | 'payday'>,
): string {
  const mode = config?.monthMode ?? 'calendar';
  const payday = config?.payday ?? 25;

  if (mode === 'calendar') {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  // payday 모드
  const p = payday;
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed
  const d = date.getDate();

  // 이번 달의 실제 급여일 구하기 (clamp 적용)
  const currentPaydayDate = getSafeDate(y, m, p);
  const currentPayday = currentPaydayDate.getDate();

  const targetDate = new Date(y, m, 1); // 날짜를 안전하게 1일로 설정하여 overflow 방지!
  
  if (d >= currentPayday) {
    // 다음 달이 기준 월이 됨
    targetDate.setMonth(targetDate.getMonth() + 1);
  }
  
  const resY = targetDate.getFullYear();
  const resM = String(targetDate.getMonth() + 1).padStart(2, '0');
  return `${resY}-${resM}`;
}


/**
 * 두 날짜 사이의 모든 YYYY-MM 월 목록 반환
 */
export function getMonthsInPeriod(start: Date, end: Date): string[] {
  const months: string[] = [];
  const curr = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  
  while (curr <= last) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    curr.setMonth(curr.getMonth() + 1);
  }
  return months;
}

// ─── 주간 범위 ────────────────────────────────────────────────────────────────

/**
 * 오늘 기준 현재 주의 시작/끝을 반환한다.
 * weekStartDay: 0=일, 1=월, ...
 */
export function getWeekBounds(
  today: Date,
  weekStartDay: number,
): { weekStart: Date; weekEnd: Date } {
  const todayDay = today.getDay();
  const daysFromStart = (todayDay - weekStartDay + 7) % 7;
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysFromStart);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  return { weekStart, weekEnd };
}

// ─── SafetyInput 도출 ─────────────────────────────────────────────────────────

/**
 * 로드된 거래 목록과 AppConfig 로 SafetyInput 을 만든다.
 * today 는 테스트 주입용 (기본값: 현재 시각)
 */
export function buildSafetyInput(
  transactions: Transaction[],
  config: AppConfig,
  today: Date = new Date(),
  overrideMonthlyBudgetBase?: number,
  accounts: Account[] = [],
  recurringItems: RecurringItem[] = [],
): SafetyInput {
  const todayStr = toLocalDateStr(today);
  const { start, end } = getBudgetPeriod(today, config);
  const { weekStart, weekEnd } = getWeekBounds(today, config.weekStartDay);

  const periodStartStr = toLocalDateStr(start);
  const weekStartStr = toLocalDateStr(weekStart);
  const weekEndStr = toLocalDateStr(weekEnd);

  const totalDays = daysBetween(start, end) + 1;
  const remainingDays = Math.max(0, daysBetween(today, end) + 1);
  const remainingDaysInCurrentWeek = Math.max(0, daysBetween(today, weekEnd) + 1);

  // 카테고리 → budgetGroup 맵
  const categoryGroup = new Map(config.categories.map((c) => [c.id, c.budgetGroup]));

  // 생활비(living) 지출 누계 (예산 기간 내, 오늘 이전)
  const livingSpentSoFar = transactions
    .filter(
      (t) =>
         t.entryKind === 'expense' &&
         categoryGroup.get(t.categoryId) === 'living' &&
         t.date >= periodStartStr &&
         t.date <= todayStr,
    )
    .reduce((s, t) => s + t.amount, 0);

  // 이번 주 생활비 지출
  const weeklyLivingSpent = transactions
    .filter(
      (t) =>
         t.entryKind === 'expense' &&
         categoryGroup.get(t.categoryId) === 'living' &&
         t.date >= weekStartStr &&
         t.date <= todayStr,
    )
    .reduce((s, t) => s + t.amount, 0);

  const fixedRequiredTotal = config.fixedExpenses
    .filter((r) => r.isActive)
    .reduce((s, r) => s + r.amount, 0);

  const endStr = toLocalDateStr(end);
  // 예산 기간 내의 미납 필수지출만 포함 (다음 달 납부 예정분 이중 차감 방지)
  const plannedRequiredTotal = config.plannedRequiredExpenses
    .filter((p) => !p.isPaid && p.dueDate >= periodStartStr && p.dueDate <= endStr)
    .reduce((s, p) => s + p.amount, 0);

  // 이번 주 미납 예정 필수지출
  const plannedRequiredThisWeek = config.plannedRequiredExpenses
    .filter((p) => !p.isPaid && p.dueDate >= weekStartStr && p.dueDate <= weekEndStr)
    .reduce((s, p) => s + p.amount, 0);

  // 생활비 통장(isBudgetAccount) 필터링 및 합계 계산
  const budgetAccounts = accounts.filter((a) => a.isActive && a.isBudgetAccount);
  const hasBudgetAccount = budgetAccounts.length > 0;
  const budgetAccountBalanceTotal = budgetAccounts.reduce((sum, a) => sum + a.balance, 0);

  // 오늘 이후 ~ 기간 종료일 사이에 납부되는 고정지출 합계
  const periodFixedExpenses = config.fixedExpenses
    .filter((fe) => fe.isActive)
    .reduce((sum, fe) => {
      const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), fe.dueDay);
      // 이번 달 납부일이 이미 지났으면 다음 달 납부일 사용
      const nextDue = thisMonthDue >= today
        ? thisMonthDue
        : new Date(today.getFullYear(), today.getMonth() + 1, fe.dueDay);
      return nextDue <= end ? sum + fe.amount : sum;
    }, 0);

  // 생활비 통장에서 나가는 정기 이체 — 기간 내 예정 건도 선차감 대상
  // (이체도 생활비 통장 잔액을 감소시키므로 Mode A의 periodFixedRemaining에 포함)
  const budgetAccountIds = new Set(budgetAccounts.map((a) => a.id));
  const periodTransferFromBudget = recurringItems
    .filter((r) =>
      r.kind === 'transfer' &&
      r.enabled &&
      r.fromAccountId != null &&
      budgetAccountIds.has(r.fromAccountId) &&
      r.nextDueDate != null,
    )
    .reduce((sum, r) => {
      const nextDue = new Date(r.nextDueDate! + 'T00:00:00');
      return nextDue >= today && nextDue <= end ? sum + r.amount : sum;
    }, 0);

  const periodFixedRemaining = periodFixedExpenses + periodTransferFromBudget;

  // 정기 자산이동(이체) 항목 월 합계 — 수입 기반 모드에서만 예산 차감에 활용
  // yearly 주기는 월 환산 (÷12), 나머지는 금액 그대로 합산
  const scheduledTransferTotal = recurringItems
    .filter((r) => r.kind === 'transfer' && r.enabled)
    .reduce((s, r) => {
      if (r.transferCycle === 'yearly') return s + Math.round(r.amount / 12);
      return s + r.amount;
    }, 0);

  return {
    expectedNetIncome: config.expectedNetIncomeDefault,
    fixedRequiredTotal,
    plannedRequiredTotal,
    savingsTarget: config.savingsTargetDefault,
    livingSpentSoFar,
    carryInAmount: 0,
    expectedSettlementReceivable: 0,
    includeSettlementReceivable: config.includeExpectedSettlementReceivableInSafety,
    totalDays,
    remainingDays,
    remainingDaysInCurrentWeek,
    weeklyLivingSpent,
    plannedRequiredThisWeek,
    thresholds: config.safetyThresholds,
    overrideMonthlyBudgetBase,
    budgetAccountBalanceTotal,
    hasBudgetAccount,
    scheduledTransferTotal,
    periodFixedRemaining,
  };
}

// ─── AssetSummary 도출 ────────────────────────────────────────────────────────

export function calcAssetSummary(accounts: Account[], liabilities: Liability[]): AssetSummary {
  const active = accounts.filter((a) => a.isActive);

  const checkingTotal = active
    .filter((a) => a.kind === 'checking')
    .reduce((s, a) => s + a.balance, 0);
  const savingsTotal = active
    .filter((a) => a.kind === 'savings')
    .reduce((s, a) => s + a.balance, 0);
  const investmentTotal = active
    .filter((a) => a.kind === 'investment')
    .reduce((s, a) => s + a.balance, 0);
  const insuranceTotal = active
    .filter((a) => a.kind === 'insurance')
    .reduce((s, a) => s + a.balance, 0);

  const totalAssets = checkingTotal + savingsTotal + investmentTotal + insuranceTotal;

  const totalLiabilities = liabilities
    .filter((l) => l.isActive)
    .reduce((s, l) => s + (l.totalBalance ?? 0), 0);

  const netWorth = totalAssets - totalLiabilities;

  const lastUpdatedAt =
    active.length > 0
      ? active.reduce(
          (latest, a) => (a.lastUpdatedAt > latest ? a.lastUpdatedAt : latest),
          active[0].lastUpdatedAt,
        )
      : new Date().toISOString();

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    checkingTotal,
    savingsTotal,
    investmentTotal,
    insuranceTotal,
    lastUpdatedAt,
  };
}
