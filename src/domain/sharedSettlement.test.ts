// sharedSettlement.test.ts — RESET Budget
// 공동정산 계산 단위 테스트

import { describe, it, expect } from 'vitest';
import {
  calcSplit,
  calcNetReceivable,
  calcNetPayable,
  calcSharedSettlementSummary,
  deriveExpenseStatus,
} from './sharedSettlement';
import type { SharedExpense, SettlementTransfer } from './types';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function makeExpense(override: Partial<SharedExpense>): SharedExpense {
  return {
    id: 'exp_1',
    transactionId: 'tx_1',
    counterpartyId: 'cp_1',
    paidBy: 'me',
    splitMode: 'equal',
    myShareAmount: 50_000,
    counterpartyShareAmount: 50_000,
    settledInAmount: 0,
    settledOutAmount: 0,
    status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...override,
  };
}

function makeTransfer(override: Partial<SettlementTransfer>): SettlementTransfer {
  return {
    id: 'st_1',
    sharedExpenseId: 'exp_1',
    direction: 'in',
    amount: 50_000,
    transferredAt: '2026-04-01',
    createdAt: '2026-04-01T00:00:00.000Z',
    ...override,
  };
}

// ─── 1. calcSplit ──────────────────────────────────────────────────────────────

describe('calcSplit', () => {
  describe('equal 분담', () => {
    it('100,000원 → 각 50,000원', () => {
      const result = calcSplit(100_000, 'equal');
      expect(result.myShareAmount).toBe(50_000);
      expect(result.counterpartyShareAmount).toBe(50_000);
    });

    it('홀수 금액: 100,001원 → 각 50,000.5원 (소수점 허용)', () => {
      const result = calcSplit(100_001, 'equal');
      expect(result.myShareAmount).toBeCloseTo(50_000.5, 1);
      expect(result.counterpartyShareAmount).toBeCloseTo(50_000.5, 1);
    });

    it('myRatio, myCustomAmount 무시', () => {
      const result = calcSplit(100_000, 'equal', 0.7, 80_000);
      expect(result.myShareAmount).toBe(50_000);
    });
  });

  describe('ratio 분담', () => {
    it('60:40 비율 — 내가 60%', () => {
      const result = calcSplit(100_000, 'ratio', 0.6);
      expect(result.myShareAmount).toBe(60_000);
      expect(result.counterpartyShareAmount).toBe(40_000);
    });

    it('0% 비율 — 내가 0원', () => {
      const result = calcSplit(100_000, 'ratio', 0);
      expect(result.myShareAmount).toBe(0);
      expect(result.counterpartyShareAmount).toBe(100_000);
    });

    it('100% 비율 — 상대방 0원', () => {
      const result = calcSplit(100_000, 'ratio', 1);
      expect(result.myShareAmount).toBe(100_000);
      expect(result.counterpartyShareAmount).toBe(0);
    });

    it('myRatio 미지정 시 기본값 50:50', () => {
      const result = calcSplit(100_000, 'ratio', undefined);
      expect(result.myShareAmount).toBe(50_000);
    });

    it('내 부담 + 상대 부담 = 총금액 (합계 일치)', () => {
      const result = calcSplit(77_777, 'ratio', 0.37);
      expect(result.myShareAmount + result.counterpartyShareAmount).toBeCloseTo(77_777, 5);
    });
  });

  describe('custom_amount 분담', () => {
    it('내가 30,000원 직접 지정, 상대방 70,000원', () => {
      const result = calcSplit(100_000, 'custom_amount', undefined, 30_000);
      expect(result.myShareAmount).toBe(30_000);
      expect(result.counterpartyShareAmount).toBe(70_000);
    });

    it('myCustomAmount 미지정 → 내가 0원, 상대방 전액', () => {
      const result = calcSplit(100_000, 'custom_amount', undefined, undefined);
      expect(result.myShareAmount).toBe(0);
      expect(result.counterpartyShareAmount).toBe(100_000);
    });
  });
});

// ─── 2. calcNetReceivable ─────────────────────────────────────────────────────

describe('calcNetReceivable', () => {
  it('내가 결제, 정산 없음 → 상대방 부담분 전액 받아야 함', () => {
    const expense = makeExpense({ paidBy: 'me' });
    expect(calcNetReceivable(expense, [])).toBe(50_000);
  });

  it('내가 결제, 일부 정산 → 남은 금액', () => {
    const expense = makeExpense({ paidBy: 'me' });
    const transfer = makeTransfer({ direction: 'in', amount: 20_000 });
    expect(calcNetReceivable(expense, [transfer])).toBe(30_000);
  });

  it('내가 결제, 전액 정산 → 0', () => {
    const expense = makeExpense({ paidBy: 'me' });
    const transfer = makeTransfer({ direction: 'in', amount: 50_000 });
    expect(calcNetReceivable(expense, [transfer])).toBe(0);
  });

  it('상대방이 결제 → 받을 금액 없음 (0)', () => {
    const expense = makeExpense({ paidBy: 'counterparty' });
    expect(calcNetReceivable(expense, [])).toBe(0);
  });

  it('다른 expense의 transfer는 무시', () => {
    const expense = makeExpense({ paidBy: 'me', id: 'exp_1' });
    const otherTransfer = makeTransfer({
      sharedExpenseId: 'exp_other',
      direction: 'in',
      amount: 50_000,
    });
    expect(calcNetReceivable(expense, [otherTransfer])).toBe(50_000);
  });

  it('초과 정산이 있어도 음수 반환 않음 (Math.max(0, ...))', () => {
    const expense = makeExpense({ paidBy: 'me', counterpartyShareAmount: 50_000 });
    const transfer = makeTransfer({ direction: 'in', amount: 60_000 });
    expect(calcNetReceivable(expense, [transfer])).toBe(0);
  });
});

// ─── 3. calcNetPayable ────────────────────────────────────────────────────────

describe('calcNetPayable', () => {
  it('상대방이 결제, 정산 없음 → 내 부담분 전액 줘야 함', () => {
    const expense = makeExpense({ paidBy: 'counterparty' });
    expect(calcNetPayable(expense, [])).toBe(50_000);
  });

  it('상대방이 결제, 일부 정산 → 남은 금액', () => {
    const expense = makeExpense({ paidBy: 'counterparty' });
    const transfer = makeTransfer({ direction: 'out', amount: 20_000 });
    expect(calcNetPayable(expense, [transfer])).toBe(30_000);
  });

  it('상대방이 결제, 전액 정산 → 0', () => {
    const expense = makeExpense({ paidBy: 'counterparty' });
    const transfer = makeTransfer({ direction: 'out', amount: 50_000 });
    expect(calcNetPayable(expense, [transfer])).toBe(0);
  });

  it('내가 결제 → 줄 금액 없음 (0)', () => {
    const expense = makeExpense({ paidBy: 'me' });
    expect(calcNetPayable(expense, [])).toBe(0);
  });

  it('방향이 out이 아닌 transfer는 무시', () => {
    const expense = makeExpense({ paidBy: 'counterparty' });
    // direction='in'은 내가 받은 것이므로 netPayable에 영향 없음
    const wrongTransfer = makeTransfer({ direction: 'in', amount: 50_000 });
    expect(calcNetPayable(expense, [wrongTransfer])).toBe(50_000);
  });
});

// ─── 4. calcSharedSettlementSummary ──────────────────────────────────────────

describe('calcSharedSettlementSummary', () => {
  it('미정산 공동지출 없음 → 모두 0', () => {
    const result = calcSharedSettlementSummary([], [], '2026-04');
    expect(result.outstandingReceivable).toBe(0);
    expect(result.outstandingPayable).toBe(0);
    expect(result.openSharedExpenseCount).toBe(0);
  });

  it('내가 결제한 미정산 → receivable에 반영', () => {
    const expense = makeExpense({ paidBy: 'me', counterpartyShareAmount: 50_000 });
    const result = calcSharedSettlementSummary([expense], [], '2026-04');
    expect(result.outstandingReceivable).toBe(50_000);
    expect(result.outstandingPayable).toBe(0);
    expect(result.openSharedExpenseCount).toBe(1);
  });

  it('상대방이 결제한 미정산 → payable에 반영', () => {
    const expense = makeExpense({ paidBy: 'counterparty', myShareAmount: 50_000 });
    const result = calcSharedSettlementSummary([expense], [], '2026-04');
    expect(result.outstandingReceivable).toBe(0);
    expect(result.outstandingPayable).toBe(50_000);
    expect(result.openSharedExpenseCount).toBe(1);
  });

  it('settled 상태는 집계 제외', () => {
    const expense = makeExpense({ paidBy: 'me', status: 'settled' });
    const result = calcSharedSettlementSummary([expense], [], '2026-04');
    expect(result.outstandingReceivable).toBe(0);
    expect(result.openSharedExpenseCount).toBe(0);
  });

  it('복수 미정산 항목 합산', () => {
    const exp1 = makeExpense({ id: 'exp_1', paidBy: 'me', counterpartyShareAmount: 30_000 });
    const exp2 = makeExpense({ id: 'exp_2', paidBy: 'me', counterpartyShareAmount: 20_000 });
    const result = calcSharedSettlementSummary([exp1, exp2], [], '2026-04');
    expect(result.outstandingReceivable).toBe(50_000);
    expect(result.openSharedExpenseCount).toBe(2);
  });

  it('이번 달 정산 완료 금액 집계', () => {
    const transfer1 = makeTransfer({ transferredAt: '2026-04-15', amount: 30_000 });
    const transfer2 = makeTransfer({ transferredAt: '2026-04-20', amount: 20_000 });
    const transfer3 = makeTransfer({ transferredAt: '2026-03-31', amount: 50_000 }); // 지난달 제외
    const result = calcSharedSettlementSummary([], [transfer1, transfer2, transfer3], '2026-04');
    expect(result.settledThisMonthAmount).toBe(50_000); // 30+20
  });
});

// ─── 5. deriveExpenseStatus ───────────────────────────────────────────────────

describe('deriveExpenseStatus', () => {
  it('정산 없음 → open', () => {
    const expense = makeExpense({ paidBy: 'me' });
    expect(deriveExpenseStatus(expense, [])).toBe('open');
  });

  it('전액 정산 → settled', () => {
    const expense = makeExpense({ paidBy: 'me', counterpartyShareAmount: 50_000 });
    const transfer = makeTransfer({ direction: 'in', amount: 50_000 });
    expect(deriveExpenseStatus(expense, [transfer])).toBe('settled');
  });

  it('일부 정산 → partially_settled', () => {
    const expense = makeExpense({ paidBy: 'me', counterpartyShareAmount: 50_000 });
    const transfer = makeTransfer({ direction: 'in', amount: 20_000 });
    expect(deriveExpenseStatus(expense, [transfer])).toBe('partially_settled');
  });

  it('상대방 결제 전액 → settled', () => {
    const expense = makeExpense({ paidBy: 'counterparty', myShareAmount: 50_000 });
    const transfer = makeTransfer({ direction: 'out', amount: 50_000 });
    expect(deriveExpenseStatus(expense, [transfer])).toBe('settled');
  });
});

// ─── 6. 복합 시나리오 ──────────────────────────────────────────────────────────

describe('복합 시나리오: 내가 40,000원 결제, 상대방 60:40 분담', () => {
  // 총액 40,000원 / 내가 결제 / 내 부담 16,000(40%) / 상대 부담 24,000(60%)
  const expense = makeExpense({
    paidBy: 'me',
    splitMode: 'ratio',
    myShareAmount: 16_000,
    counterpartyShareAmount: 24_000,
    settledInAmount: 0,
    settledOutAmount: 0,
    status: 'open',
  });

  it('calcNetReceivable: 상대방에게 받아야 할 금액 = 24,000', () => {
    expect(calcNetReceivable(expense, [])).toBe(24_000);
  });

  it('calcNetPayable: 내가 낼 금액 = 0 (내가 결제했으므로)', () => {
    expect(calcNetPayable(expense, [])).toBe(0);
  });

  it('10,000원 부분 정산 후 receivable = 14,000', () => {
    const transfer = makeTransfer({ direction: 'in', amount: 10_000 });
    expect(calcNetReceivable(expense, [transfer])).toBe(14_000);
    expect(deriveExpenseStatus(expense, [transfer])).toBe('partially_settled');
  });

  it('24,000원 전액 정산 후 receivable = 0, settled', () => {
    const transfer = makeTransfer({ direction: 'in', amount: 24_000 });
    expect(calcNetReceivable(expense, [transfer])).toBe(0);
    expect(deriveExpenseStatus(expense, [transfer])).toBe('settled');
  });
});

describe('복합 시나리오: 상대방이 60,000원 결제, 반반 분담', () => {
  const expense = makeExpense({
    paidBy: 'counterparty',
    splitMode: 'equal',
    myShareAmount: 30_000,
    counterpartyShareAmount: 30_000,
    settledInAmount: 0,
    settledOutAmount: 0,
    status: 'open',
  });

  it('calcNetPayable: 내가 줘야 할 금액 = 30,000', () => {
    expect(calcNetPayable(expense, [])).toBe(30_000);
  });

  it('calcNetReceivable: 받을 금액 = 0', () => {
    expect(calcNetReceivable(expense, [])).toBe(0);
  });

  it('10,000원 부분 송금 후 payable = 20,000', () => {
    const transfer = makeTransfer({ direction: 'out', amount: 10_000 });
    expect(calcNetPayable(expense, [transfer])).toBe(20_000);
  });
});
