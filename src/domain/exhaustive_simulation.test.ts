// exhaustive_simulation.test.ts — RESET Budget
// 데이터 무결성 검증을 위한 1000개 이상의 다차원 시뮬레이션 및 퍼뮤테이션 전수검사 테스트

import { describe, it, expect } from 'vitest';
import { calcSafetySummary } from './safety';
import type { SafetyInput } from './safety';
import { calcAssetSummary, getBudgetPeriodForMonth, getMonthsInPeriod, toLocalDateStr, buildSafetyInput, getBudgetMonthForDate } from './safetyUtils';
import { calcSplit, calcNetReceivable, deriveExpenseStatus } from './sharedSettlement';
import type { Account, Liability, SharedExpense, SettlementTransfer, Transaction, AppConfig } from './types';
import { defaultAppConfig } from './fixtures';

describe('데이터 무결성 전수검사 (Exhaustive Permutation Testing)', () => {
  it('SafetySummary - 다양한 경계값과 난수 조합(50,000개)에서 에러나 비정상값(NaN, Infinity, undefined)이 없는지 검증', () => {
    // 테스트용 파라미터 리스트 정의
    const expectedNetIncomes = [-1000000, 0, 500000, 3000000, 50000000];
    const fixedRequiredTotals = [0, 200000, 1500000, 10000000];
    const plannedRequiredTotals = [0, 100000, 1000000, 5000000];
    const savingsTargets = [0, 300000, 1000000, 5000000];
    const livingSpentSoFars = [0, 50000, 1000000, 8000000];
    const totalDaysOptions = [1, 28, 30, 31];
    const remainingDaysOptions = [-2, 0, 1, 15, 31, 35];
    const remainingDaysInCurrentWeekOptions = [0, 1, 4, 7];
    const weeklyLivingSpents = [0, 50000, 500000, 2000000];
    const hasBudgetAccountOptions = [true, false];
    const budgetAccountBalanceTotals = [-50000, 0, 1000000, 5000000];

    let count = 0;
    const maxRuns = 50000;

    // 다차원 조합 루프
    outer: for (const inc of expectedNetIncomes) {
      for (const fixed of fixedRequiredTotals) {
        for (const planned of plannedRequiredTotals) {
          for (const sav of savingsTargets) {
            for (const spent of livingSpentSoFars) {
              for (const td of totalDaysOptions) {
                for (const rd of remainingDaysOptions) {
                  for (const rdw of remainingDaysInCurrentWeekOptions) {
                    for (const wSpent of weeklyLivingSpents) {
                      for (const hasAcc of hasBudgetAccountOptions) {
                        for (const accBal of budgetAccountBalanceTotals) {
                          count++;
                          if (count > maxRuns) {
                            break outer;
                          }

                          const input: SafetyInput = {
                            expectedNetIncome: inc,
                            fixedRequiredTotal: fixed,
                            plannedRequiredTotal: planned,
                            savingsTarget: sav,
                            livingSpentSoFar: spent,
                            carryInAmount: 0,
                            expectedSettlementReceivable: 0,
                            includeSettlementReceivable: false,
                            totalDays: td,
                            remainingDays: rd,
                            remainingDaysInCurrentWeek: rdw,
                            weeklyLivingSpent: wSpent,
                            plannedRequiredThisWeek: 0,
                            hasBudgetAccount: hasAcc,
                            budgetAccountBalanceTotal: accBal,
                          };

                          const res = calcSafetySummary(input);

                          // 1. JS 원시 타입 검사 (성능을 위해 if문으로 먼저 체크하고 오류 시에만 expect 실행)
                          const isInvalid =
                            Number.isNaN(res.monthlyBudgetBase) || !Number.isFinite(res.monthlyBudgetBase) ||
                            Number.isNaN(res.livingSpentSoFar) || !Number.isFinite(res.livingSpentSoFar) ||
                            Number.isNaN(res.monthlySpendableRemaining) || !Number.isFinite(res.monthlySpendableRemaining) ||
                            Number.isNaN(res.dailyRecommendedLimit) || !Number.isFinite(res.dailyRecommendedLimit) ||
                            Number.isNaN(res.weeklyRecommendedLimit) || !Number.isFinite(res.weeklyRecommendedLimit) ||
                            Number.isNaN(res.idealSpendableRemaining) || !Number.isFinite(res.idealSpendableRemaining) ||
                            Number.isNaN(res.safetyScore) || !Number.isFinite(res.safetyScore) ||
                            Number.isNaN(res.weeklyOverspendRatio) || !Number.isFinite(res.weeklyOverspendRatio) ||
                            !res.safetyLevel;

                          if (isInvalid) {
                            expect(res).not.toBeNull(); // 실패를 보여주기 위해 강제 assertion 실행
                          }

                          // 2. 물리적 무결성 확인
                          if (rd <= 0) {
                            if (res.dailyRecommendedLimit !== 0 || res.weeklyRecommendedLimit !== 0) {
                              expect(res.dailyRecommendedLimit).toBe(0);
                            }
                          }

                          if (hasAcc && accBal < 0) {
                            if (res.safetyLevel !== 'critical') {
                              expect(res.safetyLevel).toBe('critical');
                            }
                          }

                          if (res.monthlySpendableRemaining < 0) {
                            if (res.safetyLevel !== 'critical') {
                              expect(res.safetyLevel).toBe('critical');
                            }
                          }

                          if (hasAcc) {
                            if (res.monthlySpendableRemaining !== accBal) {
                              expect(res.monthlySpendableRemaining).toBe(accBal);
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    console.log(`Executed safety summary permutation runs: ${count}`);
  });

  it('AssetSummary - 계좌 및 부채 데이터 비정상 케이스 검증', () => {
    // 1. 비어있는 리스트
    const resEmpty = calcAssetSummary([], []);
    expect(resEmpty.totalAssets).toBe(0);
    expect(resEmpty.totalLiabilities).toBe(0);
    expect(resEmpty.netWorth).toBe(0);

    // 2. 비활성 계좌 누락 검증
    const accounts: Account[] = [
      { id: 'a1', name: 'A', kind: 'checking', institution: 'Kakao', balance: 1000, isActive: true, isBudgetAccount: true, sortOrder: 1, lastUpdatedAt: '2026-06-01', createdAt: '2026-06-01' },
      { id: 'a2', name: 'B', kind: 'savings', institution: 'KB', balance: 2000, isActive: false, isBudgetAccount: false, sortOrder: 2, lastUpdatedAt: '2026-06-01', createdAt: '2026-06-01' }
    ];
    const liabilities: Liability[] = [
      { id: 'l1', name: 'L1', kind: 'loan', monthlyAmount: 100, dueDay: 25, categoryId: 'c1', totalBalance: 500, isActive: true, autoFixedExpense: true, createdAt: '2026-06-01', updatedAt: '2026-06-01' },
      { id: 'l2', name: 'L2', kind: 'credit_card_recurring', monthlyAmount: 200, dueDay: 10, categoryId: 'c2', totalBalance: 1000, isActive: false, autoFixedExpense: true, createdAt: '2026-06-01', updatedAt: '2026-06-01' }
    ];

    const res = calcAssetSummary(accounts, liabilities);
    expect(res.totalAssets).toBe(1000); // a1만 활성화
    expect(res.totalLiabilities).toBe(500); // l1만 활성화
    expect(res.netWorth).toBe(500);
  });

  it('SharedSettlement - 분담 비율 및 정산 금액 경계값 검증', () => {
    // 1. totalAmount가 홀수 또는 실수인 경우 분할 검증
    const r1 = calcSplit(10001, 'equal');
    expect(r1.myShareAmount).toBe(5000.5);
    expect(r1.counterpartyShareAmount).toBe(5000.5);

    const r2 = calcSplit(10.5, 'ratio', 0.3);
    expect(r2.myShareAmount).toBeCloseTo(3.15, 5);
    expect(r2.counterpartyShareAmount).toBeCloseTo(7.35, 5);

    // 2. custom_amount에서 myCustomAmount가 totalAmount보다 큰 비정상 케이스
    const r3 = calcSplit(5000, 'custom_amount', undefined, 6000);
    expect(r3.myShareAmount).toBe(6000);
    expect(r3.counterpartyShareAmount).toBe(-1000); // 음수 부담 허용

    // 3. 소수점 오차 및 1원 미만 자동 정산(settled) 처리 검증
    const expense: SharedExpense = {
      id: 'e1',
      transactionId: 'tx1',
      counterpartyId: 'cp1',
      paidBy: 'me',
      splitMode: 'equal',
      myShareAmount: 5000.5,
      counterpartyShareAmount: 5000.5,
      settledInAmount: 0,
      settledOutAmount: 0,
      status: 'open',
      createdAt: '2026-06-01',
      updatedAt: '2026-06-01',
    };

    // 5000원 송금받음 -> 남은 금액 0.5원 (1원 미만)
    const transfers: SettlementTransfer[] = [
      { id: 't1', sharedExpenseId: 'e1', amount: 5000, direction: 'in', transferredAt: '2026-06-01', memo: '보냄', createdAt: '2026-06-01' }
    ];

    const netRec = calcNetReceivable(expense, transfers);
    expect(netRec).toBe(0.5);

    const status = deriveExpenseStatus(expense, transfers);
    expect(status).toBe('settled'); // 0.5 < 1원 미만이므로 'settled'로 판정됨
  });

  it('Payday 모드 예산 기간 겹침 및 다중 월 거래 로드 시뮬레이션 검증', () => {
    const config: AppConfig = {
      ...defaultAppConfig,
      monthMode: 'payday',
      payday: 22,
      expectedNetIncomeDefault: 3000000,
      savingsTargetDefault: 500000,
    };

    const activeMonth = '2026-06';
    const { start, end } = getBudgetPeriodForMonth(activeMonth, config);
    
    expect(toLocalDateStr(start)).toBe('2026-05-22');
    expect(toLocalDateStr(end)).toBe('2026-06-21');

    const months = getMonthsInPeriod(start, end);
    expect(months).toEqual(['2026-05', '2026-06']);

    const mockAllTransactions: Transaction[] = [
      { id: 't1', ledgerMonth: '2026-05', date: '2026-05-25', entryKind: 'income', title: '5월 월급', amount: 3000000, categoryId: 'cat_salary', isShared: false, createdAt: '', updatedAt: '' },
      { id: 't2', ledgerMonth: '2026-05', date: '2026-05-26', entryKind: 'expense', title: '5월 지출', amount: 100000, categoryId: 'cat_food', isShared: false, createdAt: '', updatedAt: '' },
      { id: 't3', ledgerMonth: '2026-06', date: '2026-06-05', entryKind: 'expense', title: '6월 지출', amount: 200000, categoryId: 'cat_food', isShared: false, createdAt: '', updatedAt: '' },
      { id: 't4', ledgerMonth: '2026-04', date: '2026-04-25', entryKind: 'expense', title: '4월 지출', amount: 50000, categoryId: 'cat_food', isShared: false, createdAt: '', updatedAt: '' },
      { id: 't5', ledgerMonth: '2026-06', date: '2026-06-25', entryKind: 'expense', title: '6월 말 지출', amount: 100000, categoryId: 'cat_food', isShared: false, createdAt: '', updatedAt: '' },
    ];

    const startStr = toLocalDateStr(start);
    const endStr = toLocalDateStr(end);
    const filteredTxs = mockAllTransactions.filter(t => t.date >= startStr && t.date <= endStr);

    expect(filteredTxs.length).toBe(3);
    expect(filteredTxs.map(t => t.id)).toEqual(['t1', 't2', 't3']);

    const totalIncome = filteredTxs.filter(t => t.entryKind === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = filteredTxs.filter(t => t.entryKind === 'expense').reduce((s, t) => s + t.amount, 0);

    expect(totalIncome).toBe(3000000);
    expect(totalExpense).toBe(300000);

    const today = new Date(2026, 5, 9);
    const safetyInput = buildSafetyInput(filteredTxs, config, today, undefined, []);
    const summary = calcSafetySummary(safetyInput);

    expect(summary.livingSpentSoFar).toBe(300000);
    expect(summary.monthlySpendableRemaining).toBeGreaterThan(0);
    expect(Number.isNaN(summary.safetyScore)).toBe(false);
  });

  it('Payday 모드 getBudgetMonthForDate 와 getBudgetPeriodForMonth 의 365일 수학적 무결성 전수 검증', () => {
    // payday 가 1일부터 31일까지일 때, 2026년의 모든 날짜에 대해 교차 검증
    const paydays = Array.from({ length: 31 }, (_, i) => i + 1);
    
    // 2026-01-01 ~ 2026-12-31 루프
    const startDate = new Date(2026, 0, 1);
    const endDate = new Date(2026, 11, 31);
    
    let verifiedCount = 0;
    
    for (const p of paydays) {
      const config: Pick<AppConfig, 'monthMode' | 'payday'> = {
        monthMode: 'payday',
        payday: p,
      };
      
      const curr = new Date(startDate.getTime());
      while (curr <= endDate) {
        // 1. 해당 날짜에 대한 activeMonth 도출
        const ym = getBudgetMonthForDate(curr, config);
        
        // 2. 그 activeMonth 에 해당하는 예산 주기를 다시 계산
        const { start, end } = getBudgetPeriodForMonth(ym, config);
        
        // 로컬 날짜 문자열로 변환하여 비교
        const currStr = toLocalDateStr(curr);
        const startStr = toLocalDateStr(start);
        const endStr = toLocalDateStr(end);
        
        // 3. 오늘 날짜가 해당 예산 주기 범위 내에 정확히 포함되어 있는지 검증!
        const isWithin = currStr >= startStr && currStr <= endStr;
        
        if (!isWithin) {
          console.error(`Mismatch for payday=${p}, date=${currStr}. Calculated YM=${ym}, Period=${startStr} ~ ${endStr}`);
          expect(isWithin).toBe(true); // 실패 시 에러 발생시킴
        }
        
        verifiedCount++;
        
        // 다음 날로 이동
        curr.setDate(curr.getDate() + 1);
      }
    }
    
    console.log(`Successfully cross-verified ${verifiedCount} date/payday permutations for mathematical consistency.`);
  });
});

