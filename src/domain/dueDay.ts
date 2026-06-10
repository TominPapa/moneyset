// dueDay.ts — 납입일 선택지 및 표시 헬퍼
// 1~29일 + 말일(31로 저장). 31은 "해당 월의 마지막 날" 의미로 사용한다.

/** 납입일 Select 옵션: 1일~29일 + 말일 */
export const DUE_DAY_OPTIONS = [
  ...Array.from({ length: 29 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}일` })),
  { value: '31', label: '말일' },
];

/** 납입일 표시 텍스트: 31 이상이면 "말일" */
export function formatDueDay(day: number): string {
  return day >= 31 ? '말일' : `${day}일`;
}

/** 해당 월에서 dueDay가 실제로 떨어지는 날짜(일).
 *  말일(31)이나 짧은 달(2월 등)에서는 그 달의 마지막 날로 보정한다. */
export function effectiveDueDay(year: number, monthIndex: number, dueDay: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(dueDay, lastDay);
}
