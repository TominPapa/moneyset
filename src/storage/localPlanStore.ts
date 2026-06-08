// localPlanStore — BudgetPlan + RecurringItem Hybrid Storage Layer (V2.0)
// Supports Write-Through Local Backup, 1.5s Debounced Google Drive Sync,
// Sync Pending Auto-Resume, and First-Run Legacy Migration.

import type { BudgetPlan, RecurringItem } from '../domain/types';
import { localCache } from './localCacheImpl';
import { driveAdapter } from './driveAdapterImpl';

const KEY_BUDGET = (ym: string) => `reset-budget:budget:${ym}`;
const KEY_RECURRING = 'reset-budget:recurring';
const KEY_PENDING_BUDGET = (ym: string) => `reset-budget:pendingSync:budget:${ym}`;
const KEY_PENDING_RECURRING = 'reset-budget:pendingSync:recurring';

// ─── 내부 헬퍼: Local Storage 백업 (Write-Through) ─────────────────────────────

function getLocalBudgetBackup(ym: string): BudgetPlan | null {
  try {
    const raw = localStorage.getItem(KEY_BUDGET(ym));
    if (!raw) return null;
    return JSON.parse(raw) as BudgetPlan;
  } catch {
    return null;
  }
}

function saveLocalBudgetBackup(plan: BudgetPlan): void {
  try {
    localStorage.setItem(KEY_BUDGET(plan.targetMonth), JSON.stringify(plan));
  } catch (e) {
    console.error('localStorage save budget backup failed:', e);
  }
}

function getLocalRecurringBackup(): RecurringItem[] {
  try {
    const raw = localStorage.getItem(KEY_RECURRING);
    if (!raw) return [];
    return JSON.parse(raw) as RecurringItem[];
  } catch {
    return [];
  }
}

function saveLocalRecurringBackup(items: RecurringItem[]): void {
  try {
    localStorage.setItem(KEY_RECURRING, JSON.stringify(items));
  } catch (e) {
    console.error('localStorage save recurring backup failed:', e);
  }
}

// ─── 비동기 Drive 동기화 및 디바운스 타이머 관리 ───────────────────────────────

const budgetSyncTimers = new Map<string, number>();
let recurringSyncTimer: number | null = null;

function makeEnvelope<T>(fileType: string, data: T) {
  return {
    schemaVersion: '1.0',
    fileType,
    updatedAt: new Date().toISOString(),
    revisionHint: crypto.randomUUID(),
    data,
  };
}

export function triggerBudgetSync(ym: string, plan: BudgetPlan): void {
  // 1. 펜딩 플래그 표시 (로컬 유실 방지)
  localStorage.setItem(KEY_PENDING_BUDGET(ym), 'true');

  if (budgetSyncTimers.has(ym)) {
    window.clearTimeout(budgetSyncTimers.get(ym));
  }

  const timerId = window.setTimeout(async () => {
    budgetSyncTimers.delete(ym);
    try {
      if (!driveAdapter.isAuthenticated()) {
        console.warn('Drive not authenticated. Sync postponed.');
        return;
      }
      const envelope = makeEnvelope(`months/${ym}.budget.json`, plan);
      await driveAdapter.writeBudgetPlan(ym, envelope);
      localStorage.removeItem(KEY_PENDING_BUDGET(ym));
      console.log(`[Sync] BudgetPlan for ${ym} successfully synced to Google Drive.`);
    } catch (err) {
      console.error(`[Sync] BudgetPlan for ${ym} sync failed:`, err);
    }
  }, 1500);

  budgetSyncTimers.set(ym, timerId);
}

export function triggerRecurringSync(items: RecurringItem[]): void {
  // 1. 펜딩 플래그 표시 (로컬 유실 방지)
  localStorage.setItem(KEY_PENDING_RECURRING, 'true');

  if (recurringSyncTimer) {
    window.clearTimeout(recurringSyncTimer);
  }

  recurringSyncTimer = window.setTimeout(async () => {
    recurringSyncTimer = null;
    try {
      if (!driveAdapter.isAuthenticated()) {
        console.warn('Drive not authenticated. Sync postponed.');
        return;
      }
      const envelope = makeEnvelope('recurring-items.json', items);
      await driveAdapter.writeRecurringItems(envelope);
      localStorage.removeItem(KEY_PENDING_RECURRING);
      console.log('[Sync] RecurringItems successfully synced to Google Drive.');
    } catch (err) {
      console.error('[Sync] RecurringItems sync failed:', err);
    }
  }, 1500);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** 예산 계획 조회 (인메모리 캐시 → 구글 드라이브 → 로컬 백업 순으로 탐색) */
export async function getBudgetPlan(ym: string): Promise<BudgetPlan | null> {
  try {
    // 1. 인메모리 캐시 조회 (내부적으로 Drive 자동 조회 포함)
    //    localCache.getBudgetPlan은 캐시 miss 시 Drive에서 직접 읽어옴
    const cached = await localCache.getBudgetPlan(ym);
    if (cached) {
      // 로컬 백업도 함께 갱신 (Write-Through)
      saveLocalBudgetBackup(cached);
      return cached;
    }
    // 성공적으로 조회하였으나 예산 계획이 없는 경우 (null) -> 그대로 null 반환 (부활 방지)
    return null;
  } catch (err) {
    console.warn(`[Sync] Read budget plan from Drive failed, falling back to local backup:`, err);
    // 2. 로컬 백업 조회 (오프라인/미인증/드라이브 조회 실패 시)
    const backup = getLocalBudgetBackup(ym);
    if (backup) {
      // 인메모리 캐시에 갱신
      await localCache.setBudgetPlan(ym, backup);
      return backup;
    }
    return null;
  }
}

/** 예산 계획 저장 (메모리, 로컬스토리지 백업에 즉시 쓰고, 드라이브 비동기 동기화 트리거) */
export async function saveBudgetPlan(plan: BudgetPlan): Promise<void> {
  const ym = plan.targetMonth;
  // 1. 메모리 캐시 저장
  await localCache.setBudgetPlan(ym, plan);
  // 2. 로컬스토리지 백업 저장 (Write-Through)
  saveLocalBudgetBackup(plan);
  // 3. 드라이브 동기화 트리거
  triggerBudgetSync(ym, plan);
}

/** 예산 계획 삭제 */
export async function deleteBudgetPlan(ym: string): Promise<void> {
  // 1. 메모리 캐시 삭제
  await localCache.deleteBudgetPlan(ym);
  // 2. 로컬스토리지 백업 삭제
  localStorage.removeItem(KEY_BUDGET(ym));
  localStorage.removeItem(KEY_PENDING_BUDGET(ym));

  // 3. 드라이브에서도 삭제 시도 (비동기)
  if (driveAdapter.isAuthenticated()) {
    try {
      // 드라이브 삭제는 budget.json 파일을 지우거나 빈 데이터 쓰는 것으로 처리 (스펙에 맞춰 빈 데이터 저장)
      const envelope = makeEnvelope(`months/${ym}.budget.json`, null);
      // @ts-expect-error envelope data is allowed to be null for deletion representation
      await driveAdapter.writeBudgetPlan(ym, envelope);
      console.log(`[Sync] BudgetPlan ${ym} deleted from Drive.`);
    } catch (err) {
      console.error(`[Sync] Failed to delete BudgetPlan ${ym} from Drive:`, err);
    }
  }
}

/** 정기지출 목록 조회 (인메모리 캐시 → 구글 드라이브 → 로컬 백업 순으로 탐색) */
export async function getRecurringItems(): Promise<RecurringItem[]> {
  try {
    // 1. 인메모리 캐시 조회 (내부적으로 Drive 자동 조회 포함)
    //    localCache.getRecurringItems은 캐시 miss 시 Drive에서 직접 읽어옴
    const cached = await localCache.getRecurringItems();
    // 성공적으로 조회된 경우 -> 그대로 반환하고 로컬 백업도 함께 갱신 (Write-Through)
    saveLocalRecurringBackup(cached);
    return cached;
  } catch (err) {
    console.warn(`[Sync] Read recurring items from Drive failed, falling back to local backup:`, err);
    // 2. 로컬 백업 조회 (오프라인/미인증/드라이브 조회 실패 시)
    const backup = getLocalRecurringBackup();
    if (backup && backup.length > 0) {
      // 인메모리 캐시에 갱신
      await localCache.setRecurringItems(backup);
      return backup;
    }
    return [];
  }
}


/** 정기지출 목록 저장 (메모리, 로컬스토리지 백업에 즉시 쓰고, 드라이브 비동기 동기화 트리거) */
export async function saveRecurringItems(items: RecurringItem[]): Promise<void> {
  // 1. 메모리 캐시 저장
  await localCache.setRecurringItems(items);
  // 2. 로컬스토리지 백업 저장 (Write-Through)
  saveLocalRecurringBackup(items);
  // 3. 드라이브 동기화 트리거
  triggerRecurringSync(items);
}

/** 정기지출 추가/수정 */
export async function upsertRecurringItem(item: RecurringItem): Promise<void> {
  const items = await getRecurringItems();
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  await saveRecurringItems(items);
}

/** 정기지출 삭제 */
export async function deleteRecurringItem(id: string): Promise<void> {
  const items = await getRecurringItems();
  const filtered = items.filter((i) => i.id !== id);
  await saveRecurringItems(filtered);
}

// ─── 동기화 재개 & 마이그레이션 유틸 ──────────────────────────────────────────

/**
 * 펜딩된 동기화 항목이 있을 경우 자동으로 Drive에 동기화를 완료합니다. (Auto-Resume)
 */
export async function syncPendingToDrive(): Promise<void> {
  if (!driveAdapter.isAuthenticated()) return;

  console.log('[Sync] Resuming pending storage synchronizations...');

  // 1. 정기지출 펜딩 복구
  if (localStorage.getItem(KEY_PENDING_RECURRING) === 'true') {
    const items = getLocalRecurringBackup();
    if (items.length > 0) {
      console.log('[Sync] Found pending RecurringItems. Syncing now...');
      triggerRecurringSync(items);
    } else {
      localStorage.removeItem(KEY_PENDING_RECURRING);
    }
  }

  // 2. 예산 계획 펜딩 복구
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('reset-budget:pendingSync:budget:')) {
      const ym = key.replace('reset-budget:pendingSync:budget:', '');
      const plan = getLocalBudgetBackup(ym);
      if (plan) {
        console.log(`[Sync] Found pending BudgetPlan for ${ym}. Syncing now...`);
        triggerBudgetSync(ym, plan);
      } else {
        localStorage.removeItem(key);
      }
    }
  }
}

/**
 * 최초 로그인 마이그레이션: Drive에 데이터가 전혀 없는데 로컬에 데이터가 존재하는 경우
 * 로컬에 쌓인 legacy 데이터를 드라이브로 자동 업로드합니다.
 */
export async function migrateLocalDataToDrive(): Promise<void> {
  if (!driveAdapter.isAuthenticated()) return;

  try {
    // 1. 정기지출 마이그레이션
    const driveRecurring = await driveAdapter.readRecurringItems().catch(() => null);
    const hasDriveRecurring = driveRecurring && driveRecurring.data && driveRecurring.data.length > 0;
    const localRecurring = getLocalRecurringBackup();

    if (!hasDriveRecurring && localRecurring.length > 0) {
      console.log('[Migration] Migrating local legacy RecurringItems to Drive...');
      await saveRecurringItems(localRecurring);
    }

    // 2. 예산 계획 마이그레이션 (로컬에 저장된 모든 월별 예산 계획 검색)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('reset-budget:budget:')) {
        const ym = key.replace('reset-budget:budget:', '');
        const drivePlan = await driveAdapter.readBudgetPlan(ym).catch(() => null);
        const hasDrivePlan = drivePlan && drivePlan.data;
        const localPlan = getLocalBudgetBackup(ym);

        if (!hasDrivePlan && localPlan) {
          console.log(`[Migration] Migrating local legacy BudgetPlan for ${ym} to Drive...`);
          await saveBudgetPlan(localPlan);
        }
      }
    }
  } catch (err) {
    console.error('[Migration] First-run legacy migration failed:', err);
  }
}

/**
 * 현재 브라우저에 완료되지 않은 (대기 중인) 구글 드라이브 동기화 작업이 있는지 검증합니다.
 */
export function hasPendingSync(): boolean {
  if (localStorage.getItem(KEY_PENDING_RECURRING) === 'true') return true;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('reset-budget:pendingSync:budget:')) {
      return true;
    }
  }
  return false;
}
