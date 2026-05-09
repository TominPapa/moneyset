// Reset Domain — RESET Budget
// 스펙 Section 10 기준
// 순수 함수만 포함

import type { ISODate, ResetSummary } from './types';

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────

function diffDays(from: ISODate, to: ISODate): number {
  const fromMs = new Date(from + 'T00:00:00').getTime();
  const toMs = new Date(to + 'T00:00:00').getTime();
  return Math.floor((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

/** YYYY-MM-DD 문자열에 n일을 더한 날짜 문자열 반환 */
export function addDays(dateStr: ISODate, n: number): ISODate {
  const d = new Date(new Date(dateStr + 'T00:00:00').getTime() + n * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** start ~ end 사이의 날짜 배열 (최대 365개) */
export function enumerateDates(start: ISODate, end: ISODate): ISODate[] {
  const result: ISODate[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 365) {
    result.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return result;
}

// ─── 10.1 리셋 필요 여부 감지 ────────────────────────────────────────────────

export interface ResetDetectInput {
  today: ISODate;
  lastTransactionDate?: ISODate;
  lastResetCompletedDate?: ISODate;
  lastBackfilledDate?: ISODate;
  resetThresholdDays: number;         // 기본값 4
}

/**
 * 마지막 실효 활동일 기준으로 공백 일수를 계산하고 리셋 필요 여부를 반환
 */
export function detectReset(input: ResetDetectInput): ResetSummary {
  const candidates: ISODate[] = [];
  if (input.lastTransactionDate) candidates.push(input.lastTransactionDate);
  if (input.lastResetCompletedDate) candidates.push(input.lastResetCompletedDate);
  if (input.lastBackfilledDate) candidates.push(input.lastBackfilledDate);

  if (candidates.length === 0) {
    return {
      resetNeeded: false,
      blankDays: 0,
    };
  }

  // 가장 최근 활동일
  const lastEffectiveDate = candidates.reduce((latest, d) =>
    d > latest ? d : latest,
  );

  const blankDays = diffDays(lastEffectiveDate, input.today);
  const resetNeeded = blankDays >= input.resetThresholdDays;

  return {
    resetNeeded,
    blankDays,
    blankPeriodStart: resetNeeded ? lastEffectiveDate : undefined,
    blankPeriodEnd: resetNeeded ? input.today : undefined,
  };
}

// ─── 리셋 완료 후 lastEffectiveDate 갱신 ────────────────────────────────────

/**
 * 리셋 세션 완료 시 새 lastEffectiveDate 계산
 * - detailed_recovery / summary_recovery: blankPeriodEnd (= today)
 * - restart_today: today
 */
export function resolveLastEffectiveDateAfterReset(
  _mode: 'detailed_recovery' | 'summary_recovery' | 'restart_today',
  today: ISODate,
): ISODate {
  return today;
}
