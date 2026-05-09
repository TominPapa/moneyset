// safety.test.ts — RESET Budget
// 안전도 계산 단위 테스트
// 스펙 Section 21-B Fixture 케이스 10개 + 엣지 케이스 검증

import { describe, it, expect } from 'vitest';
import {
  calcMonthlyBudgetBase,
  calcMonthlySpendableRemaining,
  calcDailyRecommendedLimit,
  calcWeeklyRecommendedLimit,
  calcIdealSpendableRemaining,
  calcSafetyScore,
  calcWeeklyOverspendRatio,
  determineSafetyLevel,
  calcSafetySummary,
} from './safety';
import { safetyFixtureCases } from './fixtures';
import type { SafetyInput } from './safety';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function makeInput(override: Partial<SafetyInput>): SafetyInput {
  return {
    expectedNetIncome: 300,
    fixedRequiredTotal: 120,
    plannedRequiredTotal: 30,
    savingsTarget: 20,
    livingSpentSoFar: 50,
    carryInAmount: 0,
    expectedSettlementReceivable: 0,
    includeSettlementReceivable: false,
    totalDays: 30,
    remainingDays: 15,
    remainingDaysInCurrentWeek: 5,
    weeklyLivingSpent: 20,
    plannedRequiredThisWeek: 0,
    ...override,
  };
}

// ─── 1. calcMonthlyBudgetBase ──────────────────────────────────────────────────

describe('calcMonthlyBudgetBase', () => {
  it('기본 공식: 수입 - 고정 - 필수 - 저축', () => {
    const input = makeInput({});
    expect(calcMonthlyBudgetBase(input)).toBe(130); // 300-120-30-20
  });

  it('이월금액(carryIn) 반영', () => {
    const input = makeInput({ carryInAmount: 30 });
    expect(calcMonthlyBudgetBase(input)).toBe(160); // 300+30-120-30-20
  });

  it('공동정산 receivable OFF → 반영 안 함', () => {
    const input = makeInput({
      expectedSettlementReceivable: 15,
      includeSettlementReceivable: false,
    });
    expect(calcMonthlyBudgetBase(input)).toBe(130);
  });

  it('공동정산 receivable ON → 반영', () => {
    const input = makeInput({
      expectedSettlementReceivable: 15,
      includeSettlementReceivable: true,
    });
    expect(calcMonthlyBudgetBase(input)).toBe(145); // 300+15-120-30-20
  });

  it('고정지출이 수입을 초과하면 음수 반환', () => {
    const input = makeInput({
      expectedNetIncome: 100,
      fixedRequiredTotal: 150,
      plannedRequiredTotal: 0,
      savingsTarget: 0,
    });
    expect(calcMonthlyBudgetBase(input)).toBe(-50);
  });
});

// ─── 2. calcMonthlySpendableRemaining ─────────────────────────────────────────

describe('calcMonthlySpendableRemaining', () => {
  it('남은 생활비 = 예산 기준 - 생활비 지출', () => {
    expect(calcMonthlySpendableRemaining(130, 50)).toBe(80);
  });

  it('지출이 예산 기준 초과 → 음수 허용', () => {
    expect(calcMonthlySpendableRemaining(40, 60)).toBe(-20);
  });

  it('지출이 0이면 예산 기준 그대로', () => {
    expect(calcMonthlySpendableRemaining(130, 0)).toBe(130);
  });
});

// ─── 3. calcDailyRecommendedLimit ─────────────────────────────────────────────

describe('calcDailyRecommendedLimit', () => {
  it('남은 일수로 균등 배분', () => {
    expect(calcDailyRecommendedLimit(80, 16)).toBeCloseTo(5, 5);
  });

  it('remainingDays = 0 이면 0 반환', () => {
    expect(calcDailyRecommendedLimit(80, 0)).toBe(0);
  });

  it('남은 생활비가 음수여도 일일 한도는 그대로 계산 (음수 반환)', () => {
    expect(calcDailyRecommendedLimit(-20, 10)).toBeCloseTo(-2, 5);
  });
});

// ─── 4. calcWeeklyRecommendedLimit ────────────────────────────────────────────

describe('calcWeeklyRecommendedLimit', () => {
  it('일일 한도 × 주간 잔여 일수', () => {
    expect(calcWeeklyRecommendedLimit(5, 4)).toBe(20);
  });

  it('주간 잔여 일수가 7이면 7배', () => {
    expect(calcWeeklyRecommendedLimit(10, 7)).toBe(70);
  });
});

// ─── 5. calcIdealSpendableRemaining ───────────────────────────────────────────

describe('calcIdealSpendableRemaining', () => {
  it('기간 절반 경과 시 예산 기준의 절반', () => {
    expect(calcIdealSpendableRemaining(130, 15, 30)).toBeCloseTo(65, 5);
  });

  it('totalDays = 0 이면 0 반환 (division-by-zero 방지)', () => {
    expect(calcIdealSpendableRemaining(130, 0, 0)).toBe(0);
  });

  it('월초(remainingDays = totalDays) 이면 예산 기준 전체', () => {
    expect(calcIdealSpendableRemaining(130, 30, 30)).toBeCloseTo(130, 5);
  });

  it('월말(remainingDays = 1) 이면 예산 기준 / totalDays', () => {
    expect(calcIdealSpendableRemaining(130, 1, 30)).toBeCloseTo(130 / 30, 5);
  });
});

// ─── 6. calcSafetyScore ───────────────────────────────────────────────────────

describe('calcSafetyScore', () => {
  it('잔여 > 이상적 잔여 → 100 초과 점수', () => {
    expect(calcSafetyScore(80, 65)).toBeCloseTo(123.08, 1);
  });

  it('잔여 = 이상적 잔여 → 100점', () => {
    expect(calcSafetyScore(65, 65)).toBe(100);
  });

  it('잔여 < 이상적 잔여 → 100 미만', () => {
    expect(calcSafetyScore(50, 65)).toBeCloseTo(76.92, 1);
  });

  it('idealSpendableRemaining = 0, 잔여 양수 → 100 반환', () => {
    expect(calcSafetyScore(10, 0)).toBe(100);
  });

  it('idealSpendableRemaining = 0, 잔여 음수 → 0 반환', () => {
    expect(calcSafetyScore(-10, 0)).toBe(0);
  });

  it('idealSpendableRemaining 음수(monthlyBudgetBase<0), 잔여 음수 → 0 반환 (큰 양수 오표시 방지)', () => {
    // monthlyBudgetBase=-10, 50% 경과 → ideal=-5, remaining=-15
    expect(calcSafetyScore(-15, -5)).toBe(0);
  });
});

// ─── 7. calcWeeklyOverspendRatio ──────────────────────────────────────────────

describe('calcWeeklyOverspendRatio', () => {
  it('정상 비율 계산', () => {
    expect(calcWeeklyOverspendRatio(30, 25)).toBeCloseTo(1.2, 5);
  });

  it('지출 없음 → 0', () => {
    expect(calcWeeklyOverspendRatio(0, 25)).toBe(0);
  });

  it('weeklyRecommendedLimit = 0, 지출 있음 → 999', () => {
    expect(calcWeeklyOverspendRatio(10, 0)).toBe(999);
  });

  it('weeklyRecommendedLimit = 0, 지출 없음 → 0', () => {
    expect(calcWeeklyOverspendRatio(0, 0)).toBe(0);
  });
});

// ─── 8. determineSafetyLevel ──────────────────────────────────────────────────

describe('determineSafetyLevel', () => {
  it('monthlySpendableRemaining < 0 이면 즉시 critical', () => {
    expect(determineSafetyLevel(150, -1, 0, 0, 100)).toBe('critical');
  });

  it('점수 기반 레벨: very_safe (120 이상)', () => {
    expect(determineSafetyLevel(130, 80, 0.5, 0, 100)).toBe('very_safe');
  });

  it('점수 기반 레벨: safe (100~120)', () => {
    expect(determineSafetyLevel(110, 80, 0.5, 0, 100)).toBe('safe');
  });

  it('점수 기반 레벨: warning (80~100)', () => {
    expect(determineSafetyLevel(90, 80, 0.5, 0, 100)).toBe('warning');
  });

  it('점수 기반 레벨: risk (60~80)', () => {
    expect(determineSafetyLevel(70, 80, 0.5, 0, 100)).toBe('risk');
  });

  it('점수 기반 레벨: critical (60 미만)', () => {
    expect(determineSafetyLevel(50, 80, 0.5, 0, 100)).toBe('critical');
  });

  it('강등 규칙: weeklyOverspendRatio > 1.2 이면 최소 risk로 강등', () => {
    // safetyScore=95 (warning) + 주간 초과
    expect(determineSafetyLevel(95, 50, 1.3, 0, 100)).toBe('risk');
  });

  it('강등 규칙: 이번 주 필수지출 > 주간 권장 한도 이면 최소 risk로 강등', () => {
    // safetyScore=90 (warning) + 남은 필수지출 > 주간 권장 한도
    expect(determineSafetyLevel(90, 50, 0.5, 30, 20)).toBe('risk');
  });

  it('강등 규칙은 이미 risk/critical이면 추가 강등 없음', () => {
    // 이미 risk 상태에서 강등 조건 추가 → risk 유지
    expect(determineSafetyLevel(70, 50, 1.5, 0, 100)).toBe('risk');
  });

  it('강등 조건 없으면 점수 그대로 유지', () => {
    expect(determineSafetyLevel(90, 50, 0.8, 0, 100)).toBe('warning');
  });
});

// ─── 9. Fixture 케이스 10개 (스펙 Section 21-B) ───────────────────────────────

describe('calcSafetySummary — Fixture 케이스 10개', () => {
  for (const fixture of safetyFixtureCases) {
    it(fixture.label, () => {
      const input: SafetyInput = {
        ...fixture.input,
        plannedRequiredThisWeek: fixture.input.plannedRequiredThisWeek ?? 0,
      };

      const result = calcSafetySummary(input);

      // monthlyBudgetBase
      expect(result.monthlyBudgetBase).toBeCloseTo(fixture.expected.monthlyBudgetBase, 1);

      // monthlySpendableRemaining
      expect(result.monthlySpendableRemaining).toBeCloseTo(fixture.expected.monthlySpendableRemaining, 1);

      // safetyLevel
      expect(result.safetyLevel).toBe(fixture.expected.safetyLevel);

      // safetyScore (근사값, 오차 ±2 허용)
      if (fixture.expected.safetyScoreApprox !== undefined) {
        expect(result.safetyScore).toBeCloseTo(fixture.expected.safetyScoreApprox, 0);
      }
    });
  }
});

// ─── 10. 엣지 케이스 ───────────────────────────────────────────────────────────

describe('calcSafetySummary — 엣지 케이스', () => {
  it('수입 = 고정지출+저축: monthlyBudgetBase=0, livingSpent=0, weeklySpent=0 → score=100, level=safe', () => {
    // weeklyLivingSpent=0 으로 설정: 지출 없으면 weeklyOverspendRatio=0 → 강등 없음
    const input = makeInput({
      expectedNetIncome: 150,
      fixedRequiredTotal: 120,
      plannedRequiredTotal: 10,
      savingsTarget: 20,
      livingSpentSoFar: 0,
      weeklyLivingSpent: 0, // 중요: 지출 없어야 강등 안 됨
      totalDays: 30,
      remainingDays: 15,
    });
    const result = calcSafetySummary(input);
    expect(result.monthlyBudgetBase).toBe(0);
    expect(result.safetyScore).toBe(100);
    // monthlySpendableRemaining=0, score=100, weeklyOverspendRatio=0 → safe
    expect(result.safetyLevel).toBe('safe');
  });

  it('monthlyBudgetBase=0, 이번 주 지출 있음 → weeklyOverspendRatio=999 → 강등 → risk', () => {
    // 예산이 없는 상태에서 지출이 발생하면 risk로 강등되어야 함 (올바른 동작)
    const input = makeInput({
      expectedNetIncome: 150,
      fixedRequiredTotal: 120,
      plannedRequiredTotal: 10,
      savingsTarget: 20,
      livingSpentSoFar: 0,
      weeklyLivingSpent: 10_000, // 예산 없는데 지출 → 강등
      totalDays: 30,
      remainingDays: 15,
    });
    const result = calcSafetySummary(input);
    expect(result.monthlyBudgetBase).toBe(0);
    expect(result.safetyLevel).toBe('risk'); // 강등 적용
  });

  it('monthlyBudgetBase < 0 → safetyScore=0, level=critical', () => {
    const input = makeInput({
      expectedNetIncome: 100,
      fixedRequiredTotal: 150,
      plannedRequiredTotal: 0,
      savingsTarget: 0,
      livingSpentSoFar: 0,
      totalDays: 30,
      remainingDays: 15,
    });
    const result = calcSafetySummary(input);
    expect(result.monthlyBudgetBase).toBe(-50);
    expect(result.monthlySpendableRemaining).toBe(-50);
    // 수정된 calcSafetyScore: idealSpendableRemaining < 0 → 0 반환
    expect(result.safetyScore).toBe(0);
    expect(result.safetyLevel).toBe('critical');
  });

  it('월말(remainingDays=1): 생활비 여유 있으면 very_safe 가능', () => {
    const input = makeInput({
      expectedNetIncome: 200,
      fixedRequiredTotal: 80,
      plannedRequiredTotal: 20,
      savingsTarget: 20,
      livingSpentSoFar: 70,
      totalDays: 30,
      remainingDays: 1,
      remainingDaysInCurrentWeek: 1,
      weeklyLivingSpent: 5,
    });
    const result = calcSafetySummary(input);
    // monthlyBudgetBase=80, remaining=10, ideal=80*(1/30)≈2.67, score≈375
    expect(result.monthlyBudgetBase).toBe(80);
    expect(result.monthlySpendableRemaining).toBe(10);
    expect(result.safetyLevel).toBe('very_safe');
  });

  it('remainingDays=0 (예산 기간 종료): dailyRecommendedLimit=0', () => {
    const input = makeInput({ remainingDays: 0, remainingDaysInCurrentWeek: 0 });
    const result = calcSafetySummary(input);
    expect(result.dailyRecommendedLimit).toBe(0);
    expect(result.weeklyRecommendedLimit).toBe(0);
  });

  it('이월금액이 있으면 monthlyBudgetBase에 반영', () => {
    const input = makeInput({ carryInAmount: 30 });
    const result = calcSafetySummary(input);
    expect(result.monthlyBudgetBase).toBe(160); // 300+30-120-30-20
  });
});
