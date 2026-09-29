// derivedState 단위 테스트 — 시간 경과 파생 계산 검증
// 저장 데이터를 변경하지 않는 순수 함수이므로 날짜를 고정해 결정적으로 검증한다.

import { describe, it, expect } from 'vitest';
import {
  advanceByCycle,
  resolveRecurring,
  effectiveRemainingMonths,
  effectiveLiabilityBalance,
  effectiveInsurancePaidMonths,
} from './derivedState';
import type { RecurringItem, Liability, Account } from './types';

function makeItem(over: Partial<RecurringItem>): RecurringItem {
  return {
    id: 'ri_test',
    kind: 'regular',
    title: '테스트',
    amount: 10_000,
    categoryId: 'cat',
    nextDueDate: '2026-06-15',
    enabled: true,
    cycle: 'monthly',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

// ─── advanceByCycle ───────────────────────────────────────────────────────────

describe('advanceByCycle', () => {
  it('monthly: 일반 날짜 1개월 전진', () => {
    expect(advanceByCycle('2026-06-15', 'monthly', 15)).toBe('2026-07-15');
  });

  it('monthly: 앵커 31일 — 1/31 → 2/28 (setMonth 오버플로 방지)', () => {
    expect(advanceByCycle('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
  });

  it('monthly: 앵커 31일 — 2/28에서 전진하면 3/31 복원 (앵커 유지)', () => {
    expect(advanceByCycle('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
  });

  it('monthly: 앵커 30일 — 2월 지나며 말일 클램프 후 3/30 복원', () => {
    expect(advanceByCycle('2026-01-30', 'monthly', 30)).toBe('2026-02-28');
    expect(advanceByCycle('2026-02-28', 'monthly', 30)).toBe('2026-03-30');
  });

  it('weekly: 7일 전진 (월 경계 넘김)', () => {
    expect(advanceByCycle('2026-06-28', 'weekly', 28)).toBe('2026-07-05');
  });

  it('yearly: 1년 전진, 윤년 2/29 → 평년 2/28 클램프', () => {
    expect(advanceByCycle('2026-05-10', 'yearly', 10)).toBe('2027-05-10');
    expect(advanceByCycle('2024-02-29', 'yearly', 29)).toBe('2025-02-28');
  });
});

// ─── resolveRecurring ─────────────────────────────────────────────────────────

describe('resolveRecurring', () => {
  it('미래 날짜는 그대로 유지 (경과 0)', () => {
    const r = resolveRecurring(makeItem({ nextDueDate: '2026-08-15' }), '2026-07-21');
    expect(r.nextDueDate).toBe('2026-08-15');
    expect(r.elapsedCycles).toBe(0);
  });

  it('당일은 굴리지 않음 (오늘 납부 예정)', () => {
    const r = resolveRecurring(makeItem({ nextDueDate: '2026-07-21' }), '2026-07-21');
    expect(r.nextDueDate).toBe('2026-07-21');
    expect(r.elapsedCycles).toBe(0);
  });

  it('지난 monthly 날짜는 오늘 이후 첫 도래일로 굴림 — 원래 버그 시나리오 (6월 등록 → 7월 표시)', () => {
    const r = resolveRecurring(makeItem({ nextDueDate: '2026-06-15' }), '2026-07-21');
    expect(r.nextDueDate).toBe('2026-08-15');
    expect(r.elapsedCycles).toBe(2); // 6/15 → 7/15 → 8/15
  });

  it('여러 달 방치돼도 오늘 이후로 수렴', () => {
    const r = resolveRecurring(makeItem({ nextDueDate: '2025-01-10' }), '2026-07-21');
    expect(r.nextDueDate).toBe('2026-08-10');
  });

  it('regular 월 주기는 dayOfMonth 앵커 우선 (클램프된 저장 날짜에서 31일 복원)', () => {
    const r = resolveRecurring(
      makeItem({ nextDueDate: '2026-02-28', dayOfMonth: 31 }),
      '2026-03-01',
    );
    expect(r.nextDueDate).toBe('2026-03-31');
  });

  it('transfer는 transferCycle 사용', () => {
    const r = resolveRecurring(
      makeItem({ kind: 'transfer', cycle: undefined, transferCycle: 'weekly', nextDueDate: '2026-07-14' }),
      '2026-07-21',
    );
    expect(r.nextDueDate).toBe('2026-07-21'); // 7/14 + 7일 = 오늘
  });

  it('installment: 경과 회차만큼 잔여 감소', () => {
    const r = resolveRecurring(
      makeItem({ kind: 'installment', nextDueDate: '2026-05-10', remainingInstallments: 5 }),
      '2026-07-21',
    );
    // 5/10 → 6/10 → 7/10 → 8/10 : 3회 경과
    expect(r.elapsedCycles).toBe(3);
    expect(r.remainingInstallments).toBe(2);
    expect(r.installmentDone).toBe(false);
  });

  it('installment: 잔여 회차 소진 시 완납 처리 (0 미만으로 내려가지 않음)', () => {
    const r = resolveRecurring(
      makeItem({ kind: 'installment', nextDueDate: '2026-01-10', remainingInstallments: 3 }),
      '2026-07-21',
    );
    expect(r.remainingInstallments).toBe(0);
    expect(r.installmentDone).toBe(true);
  });

  it('빈 nextDueDate는 그대로 통과 (에러 없음)', () => {
    const r = resolveRecurring(makeItem({ nextDueDate: '' }), '2026-07-21');
    expect(r.nextDueDate).toBe('');
    expect(r.elapsedCycles).toBe(0);
  });
});

// ─── effectiveRemainingMonths / effectiveLiabilityBalance ─────────────────────

function makeLiab(over: Partial<Liability>): Liability {
  return {
    id: 'l_test',
    name: '대출',
    kind: 'loan',
    monthlyAmount: 250_000,
    dueDay: 25,
    totalBalance: 18_000_000,
    remainingMonths: 72,
    categoryId: 'cat',
    isActive: true,
    autoFixedExpense: false,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

describe('effectiveRemainingMonths', () => {
  it('편집 직후에는 저장값 그대로', () => {
    const l = makeLiab({ updatedAt: '2026-07-20T00:00:00.000Z' });
    expect(effectiveRemainingMonths(l, new Date(2026, 6, 21))).toBe(72);
  });

  it('편집 후 납부일이 지나면 회차만큼 감소 — 원래 버그 시나리오 (완납일 밀림 방지)', () => {
    // 6/1 편집, dueDay 25 → 6/25 도래 (7/25는 아직) → 1회 감소
    const l = makeLiab({});
    expect(effectiveRemainingMonths(l, new Date(2026, 6, 21))).toBe(71);
  });

  it('0 밑으로 내려가지 않음', () => {
    const l = makeLiab({ remainingMonths: 1, updatedAt: '2025-01-01T00:00:00.000Z' });
    expect(effectiveRemainingMonths(l, new Date(2026, 6, 21))).toBe(0);
  });

  it('remainingMonths 미설정이면 undefined', () => {
    const l = makeLiab({ remainingMonths: undefined });
    expect(effectiveRemainingMonths(l, new Date(2026, 6, 21))).toBeUndefined();
  });

  it('말일(31) dueDay — 짧은 달에도 매월 1회씩 정확히 카운트', () => {
    // 1/15 편집, dueDay 31(말일) → 1/31, 2/28, 3/31, 4/30, 5/31, 6/30 = 6회 (7월 말일 전)
    const l = makeLiab({ dueDay: 31, updatedAt: '2026-01-15T00:00:00.000Z' });
    expect(effectiveRemainingMonths(l, new Date(2026, 6, 21))).toBe(72 - 6);
  });
});

describe('effectiveLiabilityBalance', () => {
  it('편집 직후에는 저장값 그대로', () => {
    const l = makeLiab({ updatedAt: '2026-07-20T00:00:00.000Z' });
    expect(effectiveLiabilityBalance(l, new Date(2026, 6, 21))).toBe(18_000_000);
  });

  it('경과 회차만큼 선형 감소 근사 — 원래 버그 시나리오 (순자산 왜곡 방지)', () => {
    // 1회 경과, 18,000,000 / 72개월 = 250,000/월 → 17,750,000
    const l = makeLiab({});
    expect(effectiveLiabilityBalance(l, new Date(2026, 6, 21))).toBe(17_750_000);
  });

  it('만기일시상환(bullet)은 원금 불변', () => {
    const l = makeLiab({ repaymentType: 'bullet' });
    expect(effectiveLiabilityBalance(l, new Date(2026, 6, 21))).toBe(18_000_000);
  });

  it('0 밑으로 내려가지 않음', () => {
    const l = makeLiab({ remainingMonths: 2, totalBalance: 500_000, updatedAt: '2024-01-01T00:00:00.000Z' });
    expect(effectiveLiabilityBalance(l, new Date(2026, 6, 21))).toBe(0);
  });

  it('totalBalance 미설정이면 undefined (월세 등)', () => {
    const l = makeLiab({ totalBalance: undefined });
    expect(effectiveLiabilityBalance(l, new Date(2026, 6, 21))).toBeUndefined();
  });
});

// ─── effectiveInsurancePaidMonths ─────────────────────────────────────────────

describe('effectiveInsurancePaidMonths', () => {
  function makeInsurance(over: Partial<Account>): Account {
    return {
      id: 'a_ins',
      name: '연금보험',
      kind: 'insurance',
      balance: 2_000_000,
      isActive: true,
      sortOrder: 1,
      lastUpdatedAt: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
      insurancePeriodYears: 10,
      insurancePaidMonths: 10,
      insuranceDueDay: 25,
      insuranceMonthlyAmount: 200_000,
      ...over,
    };
  }

  it('편집 이후 도래한 납입일만큼 증가', () => {
    // 6/1 편집, dueDay 25 → 6/25 도래 → 10 + 1 = 11
    expect(effectiveInsurancePaidMonths(makeInsurance({}), new Date(2026, 6, 21))).toBe(11);
  });

  it('납입 기간(년수 × 12) 상한 클램프', () => {
    const acc = makeInsurance({
      insurancePaidMonths: 119,
      insurancePeriodYears: 10,
      lastUpdatedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(effectiveInsurancePaidMonths(acc, new Date(2026, 6, 21))).toBe(120);
  });

  it('편집 직후에는 저장값 그대로', () => {
    const acc = makeInsurance({ lastUpdatedAt: '2026-07-20T00:00:00.000Z' });
    expect(effectiveInsurancePaidMonths(acc, new Date(2026, 6, 21))).toBe(10);
  });
});
