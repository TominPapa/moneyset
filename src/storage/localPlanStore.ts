// localPlanStore — BudgetPlan + RecurringItem 로컬 스토리지 유틸 (V1.5)
// Drive 동기화는 V2에서 추가 예정. V1.5는 localStorage 사용.

import type { BudgetPlan, RecurringItem } from '../domain/types';

const KEY_BUDGET = (ym: string) => `reset-budget:budget:${ym}`;
const KEY_RECURRING = 'reset-budget:recurring';

// ─── BudgetPlan ───────────────────────────────────────────────────────────────

export function getBudgetPlan(ym: string): BudgetPlan | null {
  try {
    const raw = localStorage.getItem(KEY_BUDGET(ym));
    if (!raw) return null;
    return JSON.parse(raw) as BudgetPlan;
  } catch {
    return null;
  }
}

export function saveBudgetPlan(plan: BudgetPlan): void {
  localStorage.setItem(KEY_BUDGET(plan.targetMonth), JSON.stringify(plan));
}

export function deleteBudgetPlan(ym: string): void {
  localStorage.removeItem(KEY_BUDGET(ym));
}

// ─── RecurringItem ────────────────────────────────────────────────────────────

export function getRecurringItems(): RecurringItem[] {
  try {
    const raw = localStorage.getItem(KEY_RECURRING);
    if (!raw) return [];
    return JSON.parse(raw) as RecurringItem[];
  } catch {
    return [];
  }
}

export function saveRecurringItems(items: RecurringItem[]): void {
  localStorage.setItem(KEY_RECURRING, JSON.stringify(items));
}

export function upsertRecurringItem(item: RecurringItem): void {
  const items = getRecurringItems();
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  saveRecurringItems(items);
}

export function deleteRecurringItem(id: string): void {
  const items = getRecurringItems().filter((i) => i.id !== id);
  saveRecurringItems(items);
}
