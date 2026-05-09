// Fixtures — RESET Budget
// 스펙 Section 21-A (Seed 데이터) + Section 21-B (안전도 케이스)
// 개발/테스트용 기본값

import type {
  Category,
  PaymentMethod,
  SafetyThreshold,
  AppConfig,
  Account,
  Liability,
  Counterparty,
} from './types';

// ─── 카테고리 Seed ─────────────────────────────────────────────────────────────

export const defaultCategories: Category[] = [
  // 생활비 (living)
  { id: 'cat_food',        name: '식비',         entryKind: 'expense', budgetGroup: 'living',   icon: '🍽️', colorToken: 'amber',  sortOrder: 1 },
  { id: 'cat_cafe',        name: '카페',         entryKind: 'expense', budgetGroup: 'living',   icon: '☕',  colorToken: 'brown',  sortOrder: 2 },
  { id: 'cat_shopping',    name: '쇼핑',         entryKind: 'expense', budgetGroup: 'living',   icon: '🛍️', colorToken: 'coral',  sortOrder: 3 },
  { id: 'cat_leisure',     name: '여가',         entryKind: 'expense', budgetGroup: 'living',   icon: '🎬', colorToken: 'indigo', sortOrder: 4 },
  { id: 'cat_transport',   name: '교통',         entryKind: 'expense', budgetGroup: 'living',   icon: '🚇', colorToken: 'blue',   sortOrder: 5 },
  { id: 'cat_living_etc',  name: '기타 일상지출', entryKind: 'expense', budgetGroup: 'living',   icon: '📦', colorToken: 'gray',   sortOrder: 6 },

  // 필수지출 (required)
  { id: 'cat_rent',         name: '월세',    entryKind: 'expense', budgetGroup: 'required', icon: '🏠', colorToken: 'slate',  sortOrder: 10 },
  { id: 'cat_insurance',    name: '보험',    entryKind: 'expense', budgetGroup: 'required', icon: '🛡️', colorToken: 'green',  sortOrder: 11 },
  { id: 'cat_telecom',      name: '통신비',  entryKind: 'expense', budgetGroup: 'required', icon: '📱', colorToken: 'teal',   sortOrder: 12 },
  { id: 'cat_subscription', name: '구독',    entryKind: 'expense', budgetGroup: 'required', icon: '🔄', colorToken: 'purple', sortOrder: 13 },
  { id: 'cat_card_bill',    name: '카드대금', entryKind: 'expense', budgetGroup: 'required', icon: '💳', colorToken: 'red',    sortOrder: 14 },
  { id: 'cat_utility',      name: '공과금',  entryKind: 'expense', budgetGroup: 'required', icon: '💡', colorToken: 'yellow', sortOrder: 15 },
  { id: 'cat_loan',         name: '대출상환', entryKind: 'expense', budgetGroup: 'required', icon: '🏦', colorToken: 'orange', sortOrder: 16 },

  // 수입 (excluded — 안전도 계산 제외)
  { id: 'cat_salary',      name: '급여',    entryKind: 'income',  budgetGroup: 'excluded', icon: '💰', colorToken: 'emerald', sortOrder: 20 },
  { id: 'cat_income_etc',  name: '기타수입', entryKind: 'income',  budgetGroup: 'excluded', icon: '💵', colorToken: 'lime',    sortOrder: 21 },
];

// ─── 결제수단 Seed ─────────────────────────────────────────────────────────────

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: 'pm_cash',   name: '현금',    kind: 'cash',       isActive: true, sortOrder: 1 },
  { id: 'pm_check',  name: '체크카드', kind: 'bank',       isActive: true, sortOrder: 2 },
  { id: 'pm_credit', name: '신용카드', kind: 'card',       isActive: true, sortOrder: 3 },
  { id: 'pm_simple', name: '간편결제', kind: 'simple_pay', isActive: true, sortOrder: 4 },
];

// ─── 안전도 기준값 ─────────────────────────────────────────────────────────────

export const defaultSafetyThresholds: SafetyThreshold[] = [
  { level: 'very_safe', minInclusive: 120, maxExclusive: 9999, label: '매우 안전' },
  { level: 'safe',      minInclusive: 100, maxExclusive: 120,  label: '안전' },
  { level: 'warning',   minInclusive: 80,  maxExclusive: 100,  label: '주의' },
  { level: 'risk',      minInclusive: 60,  maxExclusive: 80,   label: '위험' },
  { level: 'critical',  minInclusive: 0,   maxExclusive: 60,   label: '위기' },
];

// ─── 기본 AppConfig ───────────────────────────────────────────────────────────

export const defaultAppConfig: AppConfig = {
  currency: 'KRW',
  monthMode: 'calendar',
  payday: 25,
  weekStartDay: 1,               // 월요일
  expectedNetIncomeDefault: 0,
  savingsTargetDefault: 0,
  includeExpectedSettlementReceivableInSafety: false,
  resetThresholdDays: 4,
  fixedExpenses: [],
  plannedRequiredExpenses: [],
  safetyThresholds: defaultSafetyThresholds,
  defaultSplitMode: 'equal',
  categories: defaultCategories,
  paymentMethods: defaultPaymentMethods,
  counterparties: [],
  themeMode: 'noir_black',
  onboardingCompleted: false,
};

// ─── 테스트용 Fixture 계좌/부채 ───────────────────────────────────────────────

export const fixtureAccounts: Account[] = [
  {
    id: 'acc_1',
    name: '카카오뱅크 생활비',
    kind: 'checking',
    institution: '카카오뱅크',
    balance: 1_500_000,
    isActive: true,
    sortOrder: 1,
    lastUpdatedAt: '2026-04-16T00:00:00.000Z',
    createdAt: '2026-04-16T00:00:00.000Z',
  },
  {
    id: 'acc_2',
    name: 'KB 정기적금',
    kind: 'savings',
    institution: 'KB국민은행',
    balance: 3_000_000,
    isActive: true,
    sortOrder: 2,
    lastUpdatedAt: '2026-04-16T00:00:00.000Z',
    createdAt: '2026-04-16T00:00:00.000Z',
  },
];

export const fixtureLiabilities: Liability[] = [
  {
    id: 'liab_1',
    name: '월세',
    kind: 'rent',
    monthlyAmount: 500_000,
    dueDay: 1,
    categoryId: 'cat_rent',
    isActive: true,
    autoFixedExpense: true,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  },
];

export const fixtureCounterparty: Counterparty = {
  id: 'cp_1',
  name: '파트너',
  isDefault: true,
};

// ─── 안전도 Fixture 케이스 (스펙 Section 21-B) ────────────────────────────────
// 계산 함수 단위 테스트에 사용하는 입력/기댓값 세트

export interface SafetyFixtureCase {
  label: string;
  input: {
    expectedNetIncome: number;
    fixedRequiredTotal: number;
    plannedRequiredTotal: number;
    savingsTarget: number;
    livingSpentSoFar: number;
    carryInAmount: number;
    expectedSettlementReceivable: number;
    includeSettlementReceivable: boolean;
    totalDays: number;
    remainingDays: number;
    remainingDaysInCurrentWeek: number;
    weeklyLivingSpent: number;
    plannedRequiredThisWeek?: number; // 강등 규칙 테스트용 (미지정 시 0)
  };
  expected: {
    monthlyBudgetBase: number;
    monthlySpendableRemaining: number;
    safetyLevel: string;
    safetyScoreApprox?: number; // 소수점 오차 허용
  };
}

export const safetyFixtureCases: SafetyFixtureCase[] = [
  {
    label: 'Case 1 — 기본 정상 (very_safe)',
    input: {
      expectedNetIncome: 300, fixedRequiredTotal: 120, plannedRequiredTotal: 30,
      savingsTarget: 20, livingSpentSoFar: 50, carryInAmount: 0,
      expectedSettlementReceivable: 0, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 15, remainingDaysInCurrentWeek: 5,
      weeklyLivingSpent: 20,
    },
    expected: { monthlyBudgetBase: 130, monthlySpendableRemaining: 80, safetyLevel: 'very_safe', safetyScoreApprox: 123.1 },
  },
  {
    label: 'Case 2 — 예산 초과 (critical)',
    input: {
      expectedNetIncome: 250, fixedRequiredTotal: 150, plannedRequiredTotal: 40,
      savingsTarget: 20, livingSpentSoFar: 60, carryInAmount: 0,
      expectedSettlementReceivable: 0, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 10, remainingDaysInCurrentWeek: 3,
      weeklyLivingSpent: 60,
    },
    expected: { monthlyBudgetBase: 40, monthlySpendableRemaining: -20, safetyLevel: 'critical' },
  },
  {
    label: 'Case 3 — receivable OFF (반영 안 함)',
    input: {
      expectedNetIncome: 300, fixedRequiredTotal: 120, plannedRequiredTotal: 30,
      savingsTarget: 20, livingSpentSoFar: 50, carryInAmount: 0,
      expectedSettlementReceivable: 15, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 15, remainingDaysInCurrentWeek: 5,
      weeklyLivingSpent: 20,
    },
    expected: { monthlyBudgetBase: 130, monthlySpendableRemaining: 80, safetyLevel: 'very_safe' },
  },
  {
    label: 'Case 4 — receivable ON (반영)',
    input: {
      expectedNetIncome: 300, fixedRequiredTotal: 120, plannedRequiredTotal: 30,
      savingsTarget: 20, livingSpentSoFar: 50, carryInAmount: 0,
      expectedSettlementReceivable: 15, includeSettlementReceivable: true,
      totalDays: 30, remainingDays: 15, remainingDaysInCurrentWeek: 5,
      weeklyLivingSpent: 20,
    },
    expected: { monthlyBudgetBase: 145, monthlySpendableRemaining: 95, safetyLevel: 'very_safe', safetyScoreApprox: 131.0 },
  },
  {
    label: 'Case 5 — 월말 (remainingDays=2, very_safe)',
    input: {
      expectedNetIncome: 200, fixedRequiredTotal: 80, plannedRequiredTotal: 20,
      savingsTarget: 20, livingSpentSoFar: 70, carryInAmount: 0,
      expectedSettlementReceivable: 0, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 2, remainingDaysInCurrentWeek: 2,
      weeklyLivingSpent: 5,
    },
    expected: { monthlyBudgetBase: 80, monthlySpendableRemaining: 10, safetyLevel: 'very_safe' },
  },
  {
    label: 'Case 6 — 주간 초과 강등 (warning→risk)',
    input: {
      expectedNetIncome: 300, fixedRequiredTotal: 120, plannedRequiredTotal: 30,
      savingsTarget: 20, livingSpentSoFar: 38, carryInAmount: 0,
      expectedSettlementReceivable: 0, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 16, remainingDaysInCurrentWeek: 4,
      weeklyLivingSpent: 52, // weeklyOverspendRatio > 1.2
    },
    expected: { monthlyBudgetBase: 130, monthlySpendableRemaining: 92, safetyLevel: 'risk' },
  },
  {
    // safetyScore≈85 (warning) + 이번 주 예정 필수지출(20) > 주간 권장 한도(18.5) → risk 강등
    // monthlyBudgetBase=130, remaining=74, ideal=86.67, score≈85.4
    // dailyLimit=3.7, weeklyLimit=18.5, plannedRequiredThisWeek=20 > 18.5 → 강등
    label: 'Case 7 — 이번 주 예정 필수지출 > 주간 권장 한도 강등 (warning→risk)',
    input: {
      expectedNetIncome: 300, fixedRequiredTotal: 120, plannedRequiredTotal: 30,
      savingsTarget: 20, livingSpentSoFar: 56, carryInAmount: 0,
      expectedSettlementReceivable: 0, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 20, remainingDaysInCurrentWeek: 5,
      weeklyLivingSpent: 5,
      plannedRequiredThisWeek: 20, // 18.5(주간권장한도) 초과 → 강등
    },
    expected: { monthlyBudgetBase: 130, monthlySpendableRemaining: 74, safetyLevel: 'risk', safetyScoreApprox: 85.4 },
  },
  {
    label: 'Case 8 — 음수 잔액 (critical 직접 처리)',
    input: {
      expectedNetIncome: 200, fixedRequiredTotal: 100, plannedRequiredTotal: 50,
      savingsTarget: 20, livingSpentSoFar: 40, carryInAmount: 0,
      expectedSettlementReceivable: 0, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 15, remainingDaysInCurrentWeek: 5,
      weeklyLivingSpent: 40,
    },
    expected: { monthlyBudgetBase: 30, monthlySpendableRemaining: -10, safetyLevel: 'critical' },
  },
  {
    label: 'Case 9 — 급여 기준 월 (very_safe)',
    input: {
      expectedNetIncome: 320, fixedRequiredTotal: 100, plannedRequiredTotal: 30,
      savingsTarget: 30, livingSpentSoFar: 40, carryInAmount: 0,
      expectedSettlementReceivable: 0, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 15, remainingDaysInCurrentWeek: 5,
      weeklyLivingSpent: 15,
    },
    expected: { monthlyBudgetBase: 160, monthlySpendableRemaining: 120, safetyLevel: 'very_safe', safetyScoreApprox: 150.0 },
  },
  {
    label: 'Case 10 — 이월(carryIn) 있는 경우 (risk)',
    input: {
      expectedNetIncome: 200, fixedRequiredTotal: 80, plannedRequiredTotal: 20,
      savingsTarget: 20, livingSpentSoFar: 60, carryInAmount: 30,
      expectedSettlementReceivable: 0, includeSettlementReceivable: false,
      totalDays: 30, remainingDays: 18, remainingDaysInCurrentWeek: 5,
      weeklyLivingSpent: 20,
    },
    expected: { monthlyBudgetBase: 110, monthlySpendableRemaining: 50, safetyLevel: 'risk', safetyScoreApprox: 75.8 },
  },
];
