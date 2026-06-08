// safetyUtils.test.ts — RESET Budget
// buildSafetyInput, getBudgetPeriod, getWeekBounds, calcAssetSummary 단위 테스트

import { describe, it, expect } from 'vitest';
import {
  buildSafetyInput,
  getBudgetPeriod,
  getWeekBounds,
  calcAssetSummary,
  toLocalDateStr,
} from './safetyUtils';
import { defaultAppConfig, defaultCategories } from './fixtures';
import type { Transaction, Account, Liability, AppConfig } from './types';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function makeConfig(override: Partial<AppConfig> = {}): AppConfig {
  return { ...defaultAppConfig, ...override };
}

function makeTx(override: Partial<Transaction>): Transaction {
  return {
    id: `tx_${Math.random()}`,
    ledgerMonth: '2026-04',
    date: '2026-04-15',
    entryKind: 'expense',
    title: '테스트 지출',
    amount: 10_000,
    categoryId: 'cat_food', // living
    isShared: false,
    createdAt: '2026-04-15T12:00:00.000Z',
    updatedAt: '2026-04-15T12:00:00.000Z',
    ...override,
  };
}

// ─── 1. toLocalDateStr ────────────────────────────────────────────────────────

describe('toLocalDateStr', () => {
  it('2026-04-15 로컬 날짜 변환', () => {
    const d = new Date(2026, 3, 15); // month is 0-indexed
    expect(toLocalDateStr(d)).toBe('2026-04-15');
  });

  it('월/일 한 자리 → 0 패딩', () => {
    const d = new Date(2026, 0, 5); // 2026-01-05
    expect(toLocalDateStr(d)).toBe('2026-01-05');
  });
});

// ─── 2. getBudgetPeriod ───────────────────────────────────────────────────────

describe('getBudgetPeriod — calendar 모드', () => {
  it('4월 15일 → 4월 1일 ~ 4월 30일', () => {
    const today = new Date(2026, 3, 15);
    const { start, end } = getBudgetPeriod(today, { monthMode: 'calendar', payday: 25 });
    expect(toLocalDateStr(start)).toBe('2026-04-01');
    expect(toLocalDateStr(end)).toBe('2026-04-30');
  });

  it('1월 1일 → 1월 1일 ~ 1월 31일', () => {
    const today = new Date(2026, 0, 1);
    const { start, end } = getBudgetPeriod(today, { monthMode: 'calendar', payday: 25 });
    expect(toLocalDateStr(start)).toBe('2026-01-01');
    expect(toLocalDateStr(end)).toBe('2026-01-31');
  });

  it('2월 말일 처리 (비윤년 2026-02)', () => {
    const today = new Date(2026, 1, 15);
    const { end } = getBudgetPeriod(today, { monthMode: 'calendar', payday: 25 });
    expect(toLocalDateStr(end)).toBe('2026-02-28');
  });
});

describe('getBudgetPeriod — payday 모드', () => {
  it('급여일(25) 이후 날짜(27일) → 이번달 25일 ~ 다음달 24일', () => {
    const today = new Date(2026, 3, 27); // 4월 27일
    const { start, end } = getBudgetPeriod(today, { monthMode: 'payday', payday: 25 });
    expect(toLocalDateStr(start)).toBe('2026-04-25');
    expect(toLocalDateStr(end)).toBe('2026-05-24');
  });

  it('급여일(25) 당일 → 이번달 25일 ~ 다음달 24일', () => {
    const today = new Date(2026, 3, 25); // 4월 25일
    const { start, end } = getBudgetPeriod(today, { monthMode: 'payday', payday: 25 });
    expect(toLocalDateStr(start)).toBe('2026-04-25');
    expect(toLocalDateStr(end)).toBe('2026-05-24');
  });

  it('급여일(25) 이전 날짜(10일) → 지난달 25일 ~ 이번달 24일', () => {
    const today = new Date(2026, 3, 10); // 4월 10일
    const { start, end } = getBudgetPeriod(today, { monthMode: 'payday', payday: 25 });
    expect(toLocalDateStr(start)).toBe('2026-03-25');
    expect(toLocalDateStr(end)).toBe('2026-04-24');
  });

  it('급여일=1 → 매월 1일이 시작', () => {
    const today = new Date(2026, 3, 15);
    const { start, end } = getBudgetPeriod(today, { monthMode: 'payday', payday: 1 });
    expect(toLocalDateStr(start)).toBe('2026-04-01');
    // end = 5월 0일 = 4월 30일
    expect(toLocalDateStr(end)).toBe('2026-04-30');
  });
});

// ─── 3. getWeekBounds ─────────────────────────────────────────────────────────

describe('getWeekBounds', () => {
  // 2026-04-15는 수요일 (getDay() = 3)
  const wednesday = new Date(2026, 3, 15);

  it('weekStartDay=1(월): 수요일 포함 주 → 월(13)~일(19)', () => {
    const { weekStart, weekEnd } = getWeekBounds(wednesday, 1);
    expect(toLocalDateStr(weekStart)).toBe('2026-04-13');
    expect(toLocalDateStr(weekEnd)).toBe('2026-04-19');
  });

  it('weekStartDay=0(일): 수요일 포함 주 → 일(12)~토(18)', () => {
    const { weekStart, weekEnd } = getWeekBounds(wednesday, 0);
    expect(toLocalDateStr(weekStart)).toBe('2026-04-12');
    expect(toLocalDateStr(weekEnd)).toBe('2026-04-18');
  });

  it('weekStartDay=1(월), 월요일 → 그 날이 weekStart', () => {
    const monday = new Date(2026, 3, 13); // 4월 13일 월요일
    const { weekStart, weekEnd } = getWeekBounds(monday, 1);
    expect(toLocalDateStr(weekStart)).toBe('2026-04-13');
    expect(toLocalDateStr(weekEnd)).toBe('2026-04-19');
  });

  it('weekStartDay=1(월), 일요일(마지막 날) → weekEnd가 당일', () => {
    const sunday = new Date(2026, 3, 19); // 4월 19일 일요일
    const { weekStart, weekEnd } = getWeekBounds(sunday, 1);
    expect(toLocalDateStr(weekStart)).toBe('2026-04-13');
    expect(toLocalDateStr(weekEnd)).toBe('2026-04-19');
  });
});

// ─── 4. buildSafetyInput — 카테고리 필터링 ────────────────────────────────────

describe('buildSafetyInput — livingSpentSoFar 카테고리 필터', () => {
  const today = new Date(2026, 3, 15); // 4월 15일
  const config = makeConfig({
    categories: defaultCategories,
    fixedExpenses: [],
    plannedRequiredExpenses: [],
  });

  it('living 카테고리 지출만 livingSpentSoFar에 포함', () => {
    const txs: Transaction[] = [
      makeTx({ categoryId: 'cat_food', amount: 10_000 }),    // living ✓
      makeTx({ categoryId: 'cat_cafe', amount: 5_000 }),     // living ✓
      makeTx({ categoryId: 'cat_rent', amount: 500_000 }),   // required ✗
      makeTx({ categoryId: 'cat_salary', amount: 3_000_000, entryKind: 'income' }), // excluded ✗
    ];
    const input = buildSafetyInput(txs, config, today);
    expect(input.livingSpentSoFar).toBe(15_000); // 10,000 + 5,000
  });

  it('income 거래는 livingSpentSoFar에 포함 안 됨', () => {
    const txs: Transaction[] = [
      makeTx({ categoryId: 'cat_salary', amount: 3_000_000, entryKind: 'income' }),
    ];
    const input = buildSafetyInput(txs, config, today);
    expect(input.livingSpentSoFar).toBe(0);
  });

  it('예산 기간(4/1~4/30) 내 거래만 포함', () => {
    const txs: Transaction[] = [
      makeTx({ date: '2026-03-31', amount: 50_000 }),  // 기간 외 ✗
      makeTx({ date: '2026-04-01', amount: 10_000 }),  // 기간 시작 ✓
      makeTx({ date: '2026-04-15', amount: 10_000 }),  // 오늘 ✓
      makeTx({ date: '2026-04-16', amount: 10_000 }),  // 미래 ✗ (오늘 이후)
    ];
    const input = buildSafetyInput(txs, config, today);
    expect(input.livingSpentSoFar).toBe(20_000); // 4/1 + 4/15
  });

  it('미래 날짜 거래는 livingSpentSoFar에서 제외', () => {
    const txs: Transaction[] = [
      makeTx({ date: '2026-04-30', amount: 100_000 }),
    ];
    const input = buildSafetyInput(txs, config, today);
    expect(input.livingSpentSoFar).toBe(0);
  });
});

describe('buildSafetyInput — weeklyLivingSpent', () => {
  // 2026-04-15 수요일, weekStartDay=1(월) → 주간 범위: 4/13~4/19
  const today = new Date(2026, 3, 15);
  const config = makeConfig({ weekStartDay: 1, categories: defaultCategories });

  it('이번 주(4/13~4/15) 내 living 지출만 weeklyLivingSpent에 포함', () => {
    const txs: Transaction[] = [
      makeTx({ date: '2026-04-12', amount: 10_000 }),  // 지난 주 ✗
      makeTx({ date: '2026-04-13', amount: 5_000 }),   // 이번 주 시작 ✓
      makeTx({ date: '2026-04-15', amount: 8_000 }),   // 오늘 ✓
      makeTx({ date: '2026-04-16', amount: 10_000 }),  // 미래 ✗
    ];
    const input = buildSafetyInput(txs, config, today);
    expect(input.weeklyLivingSpent).toBe(13_000); // 5,000 + 8,000
  });
});

describe('buildSafetyInput — fixedRequiredTotal', () => {
  it('활성 고정지출 합계', () => {
    const config = makeConfig({
      fixedExpenses: [
        { id: 'f1', name: '월세', amount: 500_000, dueDay: 1, categoryId: 'cat_rent', isActive: true },
        { id: 'f2', name: '보험', amount: 100_000, dueDay: 5, categoryId: 'cat_insurance', isActive: true },
        { id: 'f3', name: '비활성', amount: 999_999, dueDay: 10, categoryId: 'cat_telecom', isActive: false },
      ],
    });
    const input = buildSafetyInput([], config, new Date(2026, 3, 15));
    expect(input.fixedRequiredTotal).toBe(600_000); // 500,000 + 100,000
  });
});

describe('buildSafetyInput — totalDays / remainingDays', () => {
  it('calendar 모드 4월: totalDays=30', () => {
    const today = new Date(2026, 3, 1);
    const input = buildSafetyInput([], makeConfig(), today);
    expect(input.totalDays).toBe(30);
  });

  it('4월 1일: remainingDays=30 (오늘 포함)', () => {
    const today = new Date(2026, 3, 1);
    const input = buildSafetyInput([], makeConfig(), today);
    expect(input.remainingDays).toBe(30);
  });

  it('4월 30일: remainingDays=1 (마지막 날)', () => {
    const today = new Date(2026, 3, 30);
    const input = buildSafetyInput([], makeConfig(), today);
    expect(input.remainingDays).toBe(1);
  });

  it('calendar 모드 1월: totalDays=31', () => {
    const today = new Date(2026, 0, 15);
    const input = buildSafetyInput([], makeConfig(), today);
    expect(input.totalDays).toBe(31);
  });
});

// ─── 5. calcAssetSummary ──────────────────────────────────────────────────────

describe('calcAssetSummary', () => {
  const baseAccounts: Account[] = [
    {
      id: 'a1', name: '입출금', kind: 'checking', balance: 1_000_000,
      isActive: true, sortOrder: 1,
      lastUpdatedAt: '2026-04-01T00:00:00.000Z', createdAt: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'a2', name: '적금', kind: 'savings', balance: 3_000_000,
      isActive: true, sortOrder: 2,
      lastUpdatedAt: '2026-04-01T00:00:00.000Z', createdAt: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'a3', name: '투자', kind: 'investment', balance: 500_000,
      isActive: true, sortOrder: 3,
      lastUpdatedAt: '2026-04-10T00:00:00.000Z', createdAt: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'a4', name: '비활성', kind: 'checking', balance: 999_999,
      isActive: false, sortOrder: 4,
      lastUpdatedAt: '2026-04-01T00:00:00.000Z', createdAt: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'a5', name: '보험', kind: 'insurance', balance: 2_000_000,
      isActive: true, sortOrder: 5,
      lastUpdatedAt: '2026-04-05T00:00:00.000Z', createdAt: '2026-04-01T00:00:00.000Z',
      insurancePeriodYears: 10, insurancePaidMonths: 10, insuranceDueDay: 25, insuranceMonthlyAmount: 200_000,
    },
  ];

  const baseLiabilities: Liability[] = [
    {
      id: 'l1', name: '대출', kind: 'loan', monthlyAmount: 300_000,
      dueDay: 10, totalBalance: 10_000_000, categoryId: 'cat_loan',
      isActive: true, autoFixedExpense: true,
      createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ];

  it('전체 자산 = 활성 계좌 합산 (비활성 제외)', () => {
    const summary = calcAssetSummary(baseAccounts, []);
    expect(summary.totalAssets).toBe(6_500_000); // 1M + 3M + 0.5M + 2M
  });

  it('checkingTotal, savingsTotal, investmentTotal, insuranceTotal 분류', () => {
    const summary = calcAssetSummary(baseAccounts, []);
    expect(summary.checkingTotal).toBe(1_000_000);
    expect(summary.savingsTotal).toBe(3_000_000);
    expect(summary.investmentTotal).toBe(500_000);
    expect(summary.insuranceTotal).toBe(2_000_000);
  });

  it('totalLiabilities = 활성 부채의 totalBalance 합산', () => {
    const summary = calcAssetSummary(baseAccounts, baseLiabilities);
    expect(summary.totalLiabilities).toBe(10_000_000);
  });

  it('netWorth = totalAssets - totalLiabilities', () => {
    const summary = calcAssetSummary(baseAccounts, baseLiabilities);
    expect(summary.netWorth).toBe(6_500_000 - 10_000_000);
  });

  it('totalBalance 없는 부채(예: 월세)는 0으로 집계', () => {
    const noBalanceLiability: Liability = {
      id: 'l2', name: '월세', kind: 'rent', monthlyAmount: 500_000,
      dueDay: 1, categoryId: 'cat_rent',
      isActive: true, autoFixedExpense: true,
      createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
    };
    const summary = calcAssetSummary([], [noBalanceLiability]);
    expect(summary.totalLiabilities).toBe(0);
  });

  it('계좌 없을 때 0 반환', () => {
    const summary = calcAssetSummary([], []);
    expect(summary.totalAssets).toBe(0);
    expect(summary.netWorth).toBe(0);
  });

  it('lastUpdatedAt = 가장 최근 갱신 계좌 시각', () => {
    const summary = calcAssetSummary(baseAccounts, []);
    expect(summary.lastUpdatedAt).toBe('2026-04-10T00:00:00.000Z'); // a3
  });
});
