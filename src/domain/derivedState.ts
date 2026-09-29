// derivedState.ts — 시간 경과에 따른 "유효 상태" 파생 계산
//
// 원칙: 저장된 nextDueDate / 잔여 회차 / 잔여 개월 / 납입 횟수는 사용자가 직접
// 편집하거나 실행 버튼을 눌렀을 때만 변경된다. 화면 표시와 집계는 이 모듈의
// 파생 값으로 "오늘 기준 유효 상태"를 계산한다.
// 순수 함수(읽기 전용)이므로 기존 저장 데이터가 어떤 상태이든 원본을 오염시키지 않는다.

import type { RecurringItem, RecurringCycle, Liability, Account } from './types';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 로컬 시간 기준 오늘 날짜 문자열 (YYYY-MM-DD) */
export function todayStrLocal(): string {
  return dateToStr(new Date());
}

// ─── 정기 항목 (RecurringItem) ────────────────────────────────────────────────

/** 주기 1회 전진 — 월/년 이동 시 anchorDay(원래 납부일)를 유지하고 짧은 달은 말일로 클램프.
 *  (예: 앵커 31일 → 1/31 → 2/28 → 3/31, setMonth 오버플로로 3/3이 되는 문제 방지) */
export function advanceByCycle(dateStr: string, cycle: RecurringCycle, anchorDay: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (cycle === 'weekly') {
    d.setDate(d.getDate() + 7);
    return dateToStr(d);
  }
  const y = cycle === 'yearly' ? d.getFullYear() + 1 : d.getFullYear();
  const m = cycle === 'yearly' ? d.getMonth() : d.getMonth() + 1;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return dateToStr(new Date(y, m, Math.min(anchorDay, lastDay)));
}

/** 항목 종류별 실제 주기 필드 */
export function itemCycle(item: RecurringItem): RecurringCycle {
  if (item.kind === 'subscription') return item.billingCycle ?? 'monthly';
  if (item.kind === 'transfer') return item.transferCycle ?? 'monthly';
  return item.cycle ?? 'monthly';
}

export interface ResolvedRecurring {
  /** 오늘 이후로 굴린 유효 다음 납부/이체일 */
  nextDueDate: string;
  /** 저장값 대비 경과한 주기 수 */
  elapsedCycles: number;
  /** 할부: 경과 회차를 반영한 유효 잔여 회수 (installment 외에는 undefined) */
  remainingInstallments?: number;
  /** 할부 완납 여부 */
  installmentDone: boolean;
  /** 월 이동 시 유지할 납부일 앵커 */
  anchorDay: number;
}

/** 저장 데이터를 변경하지 않고, 오늘 기준 유효 nextDueDate/잔여 회차를 파생 계산 */
export function resolveRecurring(
  item: RecurringItem,
  todayStr: string = todayStrLocal(),
): ResolvedRecurring {
  const cycle = itemCycle(item);
  const storedDay = item.nextDueDate ? Number(item.nextDueDate.slice(8, 10)) : 1;
  // 앵커: regular 월 주기는 등록된 dayOfMonth 우선 (저장 날짜가 짧은 달로 클램프돼도 복원)
  const anchorDay =
    item.kind === 'regular' && cycle === 'monthly' && item.dayOfMonth
      ? item.dayOfMonth
      : storedDay;

  let next = item.nextDueDate;
  let elapsed = 0;
  if (next) {
    // 안전 상한: 비정상 데이터로 인한 무한 루프 방지 (weekly 기준 약 23년치)
    while (next < todayStr && elapsed < 1200) {
      next = advanceByCycle(next, cycle, anchorDay);
      elapsed++;
    }
  }

  if (item.kind === 'installment' && typeof item.remainingInstallments === 'number') {
    const remaining = Math.max(0, item.remainingInstallments - elapsed);
    return {
      nextDueDate: next,
      elapsedCycles: elapsed,
      remainingInstallments: remaining,
      installmentDone: remaining <= 0,
      anchorDay,
    };
  }
  return { nextDueDate: next, elapsedCycles: elapsed, installmentDone: false, anchorDay };
}

// ─── 공통: 경과 납부 회차 계산 ────────────────────────────────────────────────

/** anchor(마지막 수동 편집 시각) 이후 오늘까지 도래한 월 납부일(dueDay) 횟수.
 *  dueDay >= 31 은 말일 의미. 짧은 달은 말일로 클램프. */
function elapsedDueDates(anchorIso: string, dueDay: number, today: Date): number {
  const anchor = new Date(anchorIso);
  if (isNaN(anchor.getTime())) return 0;
  const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let count = 0;
  const cur = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  for (let i = 0; i < 1200; i++) {
    const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const day = Math.min(dueDay >= 31 ? lastDay : dueDay, lastDay);
    const due = new Date(cur.getFullYear(), cur.getMonth(), day);
    if (due > todayZero) break;
    if (due.getTime() > anchor.getTime()) count++;
    cur.setMonth(cur.getMonth() + 1);
  }
  return count;
}

// ─── 부채 (Liability) ─────────────────────────────────────────────────────────

/** 유효 잔여 개월 — 마지막 편집(updatedAt) 이후 도래한 납부일만큼 감소. 저장값 불변. */
export function effectiveRemainingMonths(
  item: Liability,
  today: Date = new Date(),
): number | undefined {
  if (typeof item.remainingMonths !== 'number') return undefined;
  return Math.max(0, item.remainingMonths - elapsedDueDates(item.updatedAt, item.dueDay, today));
}

/** 유효 잔여 원금 추정 — 경과 납부 회차만큼 원금을 선형 감소 근사.
 *  만기일시상환(bullet)은 만기까지 원금이 줄지 않으므로 그대로 유지.
 *  이자/원금 분리 정보가 없어 균등 감소 근사를 사용 (사용자가 편집하면 그 값이 새 기준). */
export function effectiveLiabilityBalance(
  item: Liability,
  today: Date = new Date(),
): number | undefined {
  if (typeof item.totalBalance !== 'number') return undefined;
  if (item.repaymentType === 'bullet') return item.totalBalance;
  const elapsed = elapsedDueDates(item.updatedAt, item.dueDay, today);
  if (elapsed === 0) return item.totalBalance;
  const baseMonths =
    item.remainingMonths && item.remainingMonths > 0
      ? item.remainingMonths
      : item.monthlyAmount > 0
        ? Math.ceil(item.totalBalance / item.monthlyAmount)
        : 0;
  if (baseMonths <= 0) return item.totalBalance;
  const perMonth = item.totalBalance / baseMonths;
  return Math.max(0, Math.round(item.totalBalance - perMonth * Math.min(elapsed, baseMonths)));
}

// ─── 저축형 보험 (Account) ────────────────────────────────────────────────────

/** 유효 납입 횟수 — 마지막 편집(lastUpdatedAt) 이후 도래한 납입일만큼 증가.
 *  납입 기간(insurancePeriodYears × 12)을 상한으로 클램프. 저장값 불변. */
export function effectiveInsurancePaidMonths(acc: Account, today: Date = new Date()): number {
  const stored = acc.insurancePaidMonths ?? 0;
  const dueDay = acc.insuranceDueDay ?? 25;
  const elapsed = elapsedDueDates(acc.lastUpdatedAt, dueDay, today);
  const cap = acc.insurancePeriodYears ? acc.insurancePeriodYears * 12 : Number.MAX_SAFE_INTEGER;
  return Math.min(stored + elapsed, cap);
}
