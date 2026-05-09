// Shared Settlement Domain — RESET Budget
// 스펙 Section 9 기준
// 순수 함수만 포함

import type {
  SharedExpense,
  SettlementTransfer,
  SharedSettlementSummary,
  SplitMode,
} from './types';

// ─── 분담 금액 계산 ───────────────────────────────────────────────────────────

export interface SplitResult {
  myShareAmount: number;
  counterpartyShareAmount: number;
}

export function calcSplit(
  totalAmount: number,
  splitMode: SplitMode,
  myRatio?: number,           // ratio 모드: 내 비율 (0~1)
  myCustomAmount?: number,    // custom_amount 모드: 내 부담액
): SplitResult {
  switch (splitMode) {
    case 'equal':
      return {
        myShareAmount: totalAmount / 2,
        counterpartyShareAmount: totalAmount / 2,
      };

    case 'ratio': {
      const ratio = myRatio ?? 0.5;
      return {
        myShareAmount: totalAmount * ratio,
        counterpartyShareAmount: totalAmount * (1 - ratio),
      };
    }

    case 'custom_amount': {
      const mine = myCustomAmount ?? 0;
      return {
        myShareAmount: mine,
        counterpartyShareAmount: totalAmount - mine,
      };
    }
  }
}

// ─── 9.3 정산 잔액 계산 ──────────────────────────────────────────────────────

/**
 * 내가 받아야 할 순 금액
 * = 상대방이 부담해야 할 금액 - 이미 나에게 송금된 금액
 */
export function calcNetReceivable(
  expense: SharedExpense,
  transfers: SettlementTransfer[],
): number {
  const transferredToMe = transfers
    .filter(t => t.sharedExpenseId === expense.id && t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  // 내가 결제한 경우 → 상대방이 나에게 줘야 함
  if (expense.paidBy === 'me') {
    return Math.max(0, expense.counterpartyShareAmount - transferredToMe);
  }
  return 0;
}

/**
 * 내가 보내야 할 순 금액
 * = 내가 상대에게 부담해야 할 금액 - 이미 내가 송금한 금액
 */
export function calcNetPayable(
  expense: SharedExpense,
  transfers: SettlementTransfer[],
): number {
  const transferredByMe = transfers
    .filter(t => t.sharedExpenseId === expense.id && t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  // 상대방이 결제한 경우 → 내가 상대방에게 줘야 함
  if (expense.paidBy === 'counterparty') {
    return expense.myShareAmount - transferredByMe;
  }
  return 0;
}

// ─── SharedSettlementSummary 계산 ────────────────────────────────────────────

export function calcSharedSettlementSummary(
  expenses: SharedExpense[],
  transfers: SettlementTransfer[],
  currentMonth: string, // YYYY-MM
): SharedSettlementSummary {
  let outstandingReceivable = 0;
  let outstandingPayable = 0;
  let openSharedExpenseCount = 0;

  for (const expense of expenses) {
    if (expense.status === 'settled') continue;

    openSharedExpenseCount++;
    outstandingReceivable += Math.max(0, calcNetReceivable(expense, transfers));
    outstandingPayable += Math.max(0, calcNetPayable(expense, transfers));
  }

  // 이번 달 정산 송금 합계
  const settledThisMonthAmount = transfers
    .filter(t => t.transferredAt.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    outstandingReceivable,
    outstandingPayable,
    openSharedExpenseCount,
    settledThisMonthAmount,
  };
}

// ─── SharedExpense 상태 갱신 ──────────────────────────────────────────────────

export function deriveExpenseStatus(
  expense: SharedExpense,
  transfers: SettlementTransfer[],
): SharedExpense['status'] {
  const netReceivable = calcNetReceivable(expense, transfers);
  const netPayable = calcNetPayable(expense, transfers);
  const remaining = netReceivable + netPayable;

  if (remaining <= 0) return 'settled';

  const totalSettled =
    transfers
      .filter(t => t.sharedExpenseId === expense.id)
      .reduce((sum, t) => sum + t.amount, 0);

  if (totalSettled > 0) return 'partially_settled';
  return 'open';
}
