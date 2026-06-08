// Safety Domain — RESET Budget
// 스펙 Section 8 기준
// 순수 함수만 포함 — UI/저장 의존 없음

import type { SafetyLevel, SafetyThreshold, SafetySummary } from './types';
import { defaultSafetyThresholds } from './fixtures';

// ─── 입력 파라미터 ─────────────────────────────────────────────────────────────

export interface SafetyInput {
  expectedNetIncome: number;
  fixedRequiredTotal: number;       // 고정지출 합계
  plannedRequiredTotal: number;     // 예정 필수지출 합계
  savingsTarget: number;
  livingSpentSoFar: number;         // 이번 달 생활비 지출 누계
  carryInAmount: number;            // 이월 금액 (기본 0)
  expectedSettlementReceivable: number;
  includeSettlementReceivable: boolean;

  totalDays: number;                // 이번 예산 기간 총 일수
  remainingDays: number;            // 오늘 포함 남은 일수
  remainingDaysInCurrentWeek: number; // 이번 주 남은 일수 (오늘 포함)

  // 주간 초과 판단용
  weeklyLivingSpent: number;        // 이번 주 생활비 지출
  plannedRequiredThisWeek?: number; // 이번 주 남은 필수지출 (강등 규칙용)

  thresholds?: SafetyThreshold[];   // 미전달 시 기본값 사용
  overrideMonthlyBudgetBase?: number; // 예산 계획에서 수립된 총 생활비 예산 금액
  budgetAccountBalanceTotal?: number; // 생활비 통장 잔액 합계
  hasBudgetAccount?: boolean;        // 생활비 통장 존재 여부
}

// ─── 8.3.1 월간 총 가용 예산 ──────────────────────────────────────────────────

export function calcMonthlyBudgetBase(input: SafetyInput): number {
  if (input.overrideMonthlyBudgetBase !== undefined && input.overrideMonthlyBudgetBase > 0) {
    return input.overrideMonthlyBudgetBase;
  }

  const receivable = input.includeSettlementReceivable
    ? input.expectedSettlementReceivable
    : 0;

  return (
    input.expectedNetIncome
    + input.carryInAmount
    + receivable
    - input.fixedRequiredTotal
    - input.plannedRequiredTotal
    - input.savingsTarget
  );
}

// ─── 8.3.2 월간 남은 생활비 ──────────────────────────────────────────────────

export function calcMonthlySpendableRemaining(
  monthlyBudgetBase: number,
  livingSpentSoFar: number,
): number {
  return monthlyBudgetBase - livingSpentSoFar;
}

// ─── 8.3.3 일일 권장 한도 ────────────────────────────────────────────────────

export function calcDailyRecommendedLimit(
  monthlySpendableRemaining: number,
  remainingDays: number,
): number {
  if (remainingDays <= 0) return 0;
  return monthlySpendableRemaining / remainingDays;
}

// ─── 8.3.4 주간 권장 한도 ────────────────────────────────────────────────────

export function calcWeeklyRecommendedLimit(
  dailyRecommendedLimit: number,
  remainingDaysInCurrentWeek: number,
): number {
  return dailyRecommendedLimit * remainingDaysInCurrentWeek;
}

// ─── 8.3.5 안전도 점수 ───────────────────────────────────────────────────────

export function calcIdealSpendableRemaining(
  monthlyBudgetBase: number,
  remainingDays: number,
  totalDays: number,
): number {
  if (totalDays <= 0) return 0;
  return monthlyBudgetBase * (remainingDays / totalDays);
}

export function calcSafetyScore(
  monthlySpendableRemaining: number,
  idealSpendableRemaining: number,
): number {
  // idealSpendableRemaining 이 음수인 경우: monthlyBudgetBase 자체가 음수
  // → 남은 생활비도 음수이므로 critical 처리. 점수는 0 반환 (큰 양수 오표시 방지)
  if (idealSpendableRemaining <= 0) {
    return monthlySpendableRemaining >= 0 ? 100 : 0;
  }
  return (monthlySpendableRemaining / idealSpendableRemaining) * 100;
}

// ─── 주간 초과 비율 ───────────────────────────────────────────────────────────

export function calcWeeklyOverspendRatio(
  weeklyLivingSpent: number,
  weeklyRecommendedLimit: number,
): number {
  if (weeklyRecommendedLimit <= 0) return weeklyLivingSpent > 0 ? 999 : 0;
  return weeklyLivingSpent / weeklyRecommendedLimit;
}

// ─── 8.4 안전도 레벨 결정 ────────────────────────────────────────────────────

export function determineSafetyLevel(
  safetyScore: number,
  monthlySpendableRemaining: number,
  weeklyOverspendRatio: number,
  plannedRequiredThisWeek: number,
  monthlySpendableForWeekCheck: number,
  thresholds: SafetyThreshold[] = defaultSafetyThresholds,
): SafetyLevel {
  // 음수이면 즉시 critical
  if (monthlySpendableRemaining < 0) return 'critical';

  // 기본 레벨 결정
  let level: SafetyLevel = 'critical';
  const sorted = [...thresholds].sort((a, b) => b.minInclusive - a.minInclusive);
  for (const t of sorted) {
    if (safetyScore >= t.minInclusive) {
      level = t.level;
      break;
    }
  }

  // 강등 규칙: 아래 중 하나라도 참이면 최소 risk 수준으로 강등
  const shouldDemote =
    weeklyOverspendRatio > 1.2 ||
    plannedRequiredThisWeek > monthlySpendableForWeekCheck;

  if (shouldDemote) {
    const demotionOrder: SafetyLevel[] = ['very_safe', 'safe', 'warning', 'risk', 'critical'];
    const currentIdx = demotionOrder.indexOf(level);
    const riskIdx = demotionOrder.indexOf('risk');
    if (currentIdx < riskIdx) return 'risk';
  }

  return level;
}

// ─── 전체 SafetySummary 계산 ──────────────────────────────────────────────────

export function calcSafetySummary(
  input: SafetyInput,
): SafetySummary {
  let monthlyBudgetBase = 0;
  let monthlySpendableRemaining = 0;

  if (input.hasBudgetAccount && input.budgetAccountBalanceTotal !== undefined) {
    // 1. 생활비 통장이 등록된 경우: 통장 잔액의 합계가 '남은 생활비'가 됨
    monthlySpendableRemaining = input.budgetAccountBalanceTotal;
    // 가용 예산 베이스 = 현재 잔액 + 이번 달에 이미 쓴 생활비 누계
    monthlyBudgetBase = monthlySpendableRemaining + input.livingSpentSoFar;
  } else {
    // 2. 생활비 통장이 없는 경우 (기존의 예상 수입 기반 폴백)
    monthlyBudgetBase = calcMonthlyBudgetBase(input);
    monthlySpendableRemaining = calcMonthlySpendableRemaining(
      monthlyBudgetBase,
      input.livingSpentSoFar,
    );
  }

  // 생활비 통장이 등록됐지만 잔액도 0이고 지출도 0인 경우
  // (계좌 등록 직후 잔액 미입력) → 데이터 없음으로 처리 (critical, score=0)
  if (input.hasBudgetAccount && monthlyBudgetBase === 0 && monthlySpendableRemaining === 0) {
    return {
      monthlyBudgetBase: 0,
      livingSpentSoFar: input.livingSpentSoFar,
      monthlySpendableRemaining: 0,
      dailyRecommendedLimit: 0,
      weeklyRecommendedLimit: 0,
      idealSpendableRemaining: 0,
      safetyScore: 0,
      safetyLevel: 'critical',
      weeklyOverspendRatio: 0,
    };
  }

  const dailyRecommendedLimit = calcDailyRecommendedLimit(
    monthlySpendableRemaining,
    input.remainingDays,
  );
  const weeklyRecommendedLimit = calcWeeklyRecommendedLimit(
    dailyRecommendedLimit,
    input.remainingDaysInCurrentWeek,
  );
  const idealSpendableRemaining = calcIdealSpendableRemaining(
    monthlyBudgetBase,
    input.remainingDays,
    input.totalDays,
  );
  const safetyScore = calcSafetyScore(monthlySpendableRemaining, idealSpendableRemaining);
  const weeklyOverspendRatio = calcWeeklyOverspendRatio(
    input.weeklyLivingSpent,
    weeklyRecommendedLimit,
  );
  const plannedRequiredThisWeek = input.plannedRequiredThisWeek ?? 0;
  const safetyLevel = determineSafetyLevel(
    safetyScore,
    monthlySpendableRemaining,
    weeklyOverspendRatio,
    plannedRequiredThisWeek,
    weeklyRecommendedLimit,  // 이번 주 예정 필수지출과 이번 주 권장 한도를 비교
    input.thresholds,
  );

  return {
    monthlyBudgetBase,
    livingSpentSoFar: input.livingSpentSoFar,
    monthlySpendableRemaining,
    dailyRecommendedLimit,
    weeklyRecommendedLimit,
    idealSpendableRemaining,
    safetyScore,
    safetyLevel,
    weeklyOverspendRatio,
  };
}
