// reset.test.ts — RESET Budget
// 리셋 감지 / 날짜 유틸 단위 테스트

import { describe, it, expect } from 'vitest';
import { detectReset, addDays, enumerateDates } from './reset';

// ─── 1. addDays ───────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('+1일', () => {
    expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
  });

  it('+7일', () => {
    expect(addDays('2026-04-15', 7)).toBe('2026-04-22');
  });

  it('월 경계 넘기', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('연 경계 넘기', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('+0일 → 동일 날짜', () => {
    expect(addDays('2026-04-15', 0)).toBe('2026-04-15');
  });
});

// ─── 2. enumerateDates ────────────────────────────────────────────────────────

describe('enumerateDates', () => {
  it('같은 날 → [start]', () => {
    expect(enumerateDates('2026-04-15', '2026-04-15')).toEqual(['2026-04-15']);
  });

  it('3일 범위 → 3개', () => {
    const dates = enumerateDates('2026-04-13', '2026-04-15');
    expect(dates).toEqual(['2026-04-13', '2026-04-14', '2026-04-15']);
  });

  it('end < start → 빈 배열', () => {
    expect(enumerateDates('2026-04-15', '2026-04-14')).toEqual([]);
  });

  it('365개 초과 방지 (guard=365)', () => {
    const dates = enumerateDates('2026-01-01', '2028-01-01');
    expect(dates.length).toBe(365);
  });
});

// ─── 3. detectReset ──────────────────────────────────────────────────────────

describe('detectReset', () => {
  const threshold = 4;

  it('활동 이력 없음 → resetNeeded=false', () => {
    const result = detectReset({ today: '2026-04-15', resetThresholdDays: threshold });
    expect(result.resetNeeded).toBe(false);
    expect(result.blankDays).toBe(0);
  });

  it('공백 일수 < threshold → resetNeeded=false', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-13', // 2일 전
      resetThresholdDays: threshold,
    });
    expect(result.resetNeeded).toBe(false);
    expect(result.blankDays).toBe(2);
  });

  it('공백 일수 = threshold → resetNeeded=true (경계값)', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-11', // 4일 전
      resetThresholdDays: threshold,
    });
    expect(result.resetNeeded).toBe(true);
    expect(result.blankDays).toBe(4);
  });

  it('공백 일수 > threshold → resetNeeded=true', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-05', // 10일 전
      resetThresholdDays: threshold,
    });
    expect(result.resetNeeded).toBe(true);
    expect(result.blankDays).toBe(10);
  });

  it('lastResetCompletedDate가 lastTransactionDate보다 최신이면 우선', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-01',  // 14일 전
      lastResetCompletedDate: '2026-04-14', // 1일 전 → 최신
      resetThresholdDays: threshold,
    });
    expect(result.resetNeeded).toBe(false);
    expect(result.blankDays).toBe(1);
  });

  it('lastBackfilledDate가 있으면 고려', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-01',
      lastBackfilledDate: '2026-04-13', // 2일 전
      resetThresholdDays: threshold,
    });
    expect(result.resetNeeded).toBe(false);
    expect(result.blankDays).toBe(2);
  });

  it('세 후보 중 가장 최신 날짜 선택', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-01',
      lastResetCompletedDate: '2026-04-05',
      lastBackfilledDate: '2026-04-12', // 최신 → 3일 전
      resetThresholdDays: threshold,
    });
    expect(result.blankDays).toBe(3);
    expect(result.resetNeeded).toBe(false);
  });

  it('resetNeeded=true 이면 blankPeriodStart/End 설정', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-10',
      resetThresholdDays: threshold,
    });
    expect(result.resetNeeded).toBe(true);
    expect(result.blankPeriodStart).toBe('2026-04-10');
    expect(result.blankPeriodEnd).toBe('2026-04-15');
  });

  it('resetNeeded=false 이면 blankPeriodStart/End=undefined', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-14',
      resetThresholdDays: threshold,
    });
    expect(result.resetNeeded).toBe(false);
    expect(result.blankPeriodStart).toBeUndefined();
    expect(result.blankPeriodEnd).toBeUndefined();
  });

  it('당일(오늘) 거래 있음 → blankDays=0, resetNeeded=false', () => {
    const result = detectReset({
      today: '2026-04-15',
      lastTransactionDate: '2026-04-15',
      resetThresholdDays: threshold,
    });
    expect(result.blankDays).toBe(0);
    expect(result.resetNeeded).toBe(false);
  });

  it('월 경계 넘는 공백 (3월 → 4월)', () => {
    const result = detectReset({
      today: '2026-04-05',
      lastTransactionDate: '2026-03-20',
      resetThresholdDays: threshold,
    });
    expect(result.blankDays).toBe(16);
    expect(result.resetNeeded).toBe(true);
  });
});
