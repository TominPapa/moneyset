// safetyUtils.ts — RESET Budget
// 실제 앱 데이터에서 SafetyInput / AssetSummary 를 도출하는 순수 헬퍼 함수

import type { Transaction, AppConfig, Account, Liability, AssetSummary } from './types';
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
 * 오늘 날짜와 AppConfig 를 바탕으로 현재 예산 기간의 시작/끝을 반환한다.
 * - calendar 모드: 해당 달의 1일 ~ 말일
 * - payday 모드: 지난 달 급여일 ~ 이번 달 급여일 전날 (또는 이번 달 급여일 ~ 다음 달 급여일 전날)
 */
export function getBudgetPeriod(
  today: Date,
  config: Pick<AppConfig, 'monthMode' | 'payday'>,
): { start: Date; end: Date } {
  if (config.monthMode === 'calendar') {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    };
  }

  // payday 모드
  const p = config.payday;
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed

  if (today.getDate() >= p) {
    // 이번 달 급여일 ~ 다음 달 급여일 전날
    return {
      start: new Date(y, m, p),
      end: new Date(y, m + 1, p - 1),
    };
  } else {
    // 지난 달 급여일 ~ 이번 달 급여일 전날
    return {
      start: new Date(y, m - 1, p),
      end: new Date(y, m, p - 1),
    };
  }
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

  const plannedRequiredTotal = config.plannedRequiredExpenses
    .filter((p) => !p.isPaid)
    .reduce((s, p) => s + p.amount, 0);

  // 이번 주 미납 예정 필수지출
  const plannedRequiredThisWeek = config.plannedRequiredExpenses
    .filter((p) => !p.isPaid && p.dueDate >= weekStartStr && p.dueDate <= weekEndStr)
    .reduce((s, p) => s + p.amount, 0);

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

  const totalAssets = checkingTotal + savingsTotal + investmentTotal;

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
    lastUpdatedAt,
  };
}
