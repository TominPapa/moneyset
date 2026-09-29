// backupService — RESET Budget 일별 스냅샷 백업/복원
// 하루 1회 자동 저장, 최근 7일치 보관
// 저장 위치: Drive backups/snapshot_YYYY-MM-DD.json

import type {
  AppConfig,
  Account,
  Liability,
  Transaction,
  SharedExpense,
  SettlementTransfer,
  ResetSession,
  BudgetPlan,
  RecurringItem,
} from '../domain/types';
import { localCache } from './localCacheImpl';
import { driveAdapter } from './driveAdapterImpl';
import type { BackupMeta } from './driveAdapter';
import { toLocalDateStr } from '../domain/safetyUtils';

// ─── 스냅샷 형태 ──────────────────────────────────────────────────────────────

export interface FullSnapshot {
  version: '1';
  savedAt: string;                              // ISO datetime
  config: AppConfig | null;
  accounts: Account[];
  liabilities: Liability[];
  transactions: Record<string, Transaction[]>; // ym → []
  sharedExpenses: Record<string, SharedExpense[]>;
  settlementTransfers: SettlementTransfer[];
  resetSessions: ResetSession[];
  budgetPlans?: Record<string, BudgetPlan | null>;
  recurringItems?: RecurringItem[];
}

export type { BackupMeta };

// ─── 내부 상수 ────────────────────────────────────────────────────────────────

const SNAPSHOT_DATE_KEY = 'rb_last_snapshot_date';
const KEEP_DAYS = 7;
const RECENT_MONTHS_COUNT = 18; // 최근 18개월치 수집

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function recentMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function makeEnv<T>(fileType: string, data: T) {
  return {
    schemaVersion: '1.0',
    fileType,
    updatedAt: new Date().toISOString(),
    revisionHint: crypto.randomUUID(),
    data,
  };
}

async function runInChunks<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkRes = await Promise.all(chunk.map(fn));
    results.push(...chunkRes);
  }
  return results;
}

// ─── 스냅샷 수집 ─────────────────────────────────────────────────────────────

async function collectSnapshot(): Promise<FullSnapshot> {
  const months = recentMonths(RECENT_MONTHS_COUNT);

  const [config, accounts, liabilities, settlementTransfers, resetSessions, recurringItems] =
    await Promise.all([
      localCache.getConfig(),
      localCache.getAccounts(),
      localCache.getLiabilities(),
      localCache.getSettlementTransfers(),
      localCache.getResetSessions(),
      localCache.getRecurringItems(),
    ]);

  // 청크 단위(4개씩)로 월별 데이터 수집 (API 과부하 방지)
  // 핵심 섹션(config·계좌·부채 등)은 실패 시 위 Promise.all 이 그대로 던져 백업을 중단시킨다.
  // 반면 개별 월 조회 실패는 그 달을 스냅샷에서 생략만 한다 —
  // 복원 시 없는 키는 건드리지 않으므로 데이터가 삭제되지는 않는다.
  const txResults = await runInChunks(months, 4, async (ym) => {
    try {
      return { ym, data: await localCache.getTransactions(ym) };
    } catch {
      console.warn(`[Backup] ${ym} 거래 조회 실패 — 이번 스냅샷에서 제외합니다`);
      return { ym, data: [] as Transaction[] };
    }
  });

  const seResults = await runInChunks(months, 4, async (ym) => {
    try {
      return { ym, data: await localCache.getSharedExpenses(ym) };
    } catch {
      console.warn(`[Backup] ${ym} 공동지출 조회 실패 — 이번 스냅샷에서 제외합니다`);
      return { ym, data: [] as SharedExpense[] };
    }
  });

  const bpResults = await runInChunks(months, 4, async (ym) => {
    try {
      return { ym, data: await localCache.getBudgetPlan(ym) };
    } catch {
      console.warn(`[Backup] ${ym} 예산계획 조회 실패 — 이번 스냅샷에서 제외합니다`);
      return { ym, data: null as BudgetPlan | null };
    }
  });

  const transactions: Record<string, Transaction[]> = {};
  const sharedExpenses: Record<string, SharedExpense[]> = {};
  const budgetPlans: Record<string, BudgetPlan | null> = {};

  for (const { ym, data } of txResults) if (data.length > 0) transactions[ym] = data;
  for (const { ym, data } of seResults) if (data.length > 0) sharedExpenses[ym] = data;
  for (const { ym, data } of bpResults) if (data) budgetPlans[ym] = data;

  return {
    version: '1',
    savedAt: new Date().toISOString(),
    config,
    accounts,
    liabilities,
    transactions,
    sharedExpenses,
    settlementTransfers,
    resetSessions,
    budgetPlans,
    recurringItems,
  };
}

// ─── 오래된 백업 정리 ─────────────────────────────────────────────────────────

async function pruneOldBackups(): Promise<void> {
  try {
    const list = await driveAdapter.listBackups();
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const toDelete = sorted.slice(KEEP_DAYS);
    await Promise.all(toDelete.map((b) => driveAdapter.deleteBackup(b.fileId)));
  } catch {
    // 정리 실패는 무시 — 저장 자체가 성공하면 OK
  }
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 하루 1회만 스냅샷 저장 (로그인 직후 백그라운드 호출용).
 * localStorage로 중복 실행 방지.
 */
export async function maybeSaveSnapshot(): Promise<void> {
  // 로컬 날짜 기준 — toISOString은 UTC라 KST 오전 0~9시에 "어제" 키로 저장돼
  // 전날 스냅샷을 덮어쓰는 문제 방지
  const today = toLocalDateStr(new Date());
  if (localStorage.getItem(SNAPSHOT_DATE_KEY) === today) return;

  try {
    const snapshot = await collectSnapshot();
    await driveAdapter.writeBackup(today, snapshot);
    localStorage.setItem(SNAPSHOT_DATE_KEY, today);
    await pruneOldBackups();
  } catch {
    // 백업 실패는 조용히 무시 — 사용자 경험 방해 금지
  }
}

/**
 * 즉시 스냅샷 저장 (수동 백업 버튼용).
 * 성공 시 localStorage 날짜 갱신.
 */
export async function saveSnapshotNow(): Promise<void> {
  const today = toLocalDateStr(new Date());
  const snapshot = await collectSnapshot();
  await driveAdapter.writeBackup(today, snapshot);
  localStorage.setItem(SNAPSHOT_DATE_KEY, today);
  await pruneOldBackups();
}

/** Drive에서 백업 목록 조회 (날짜 내림차순) */
export async function listBackups(): Promise<BackupMeta[]> {
  const list = await driveAdapter.listBackups();
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 특정 스냅샷으로 복원.
 * localCache + Drive 양쪽 모두 덮어씀.
 * 완료 후 호출자가 window.location.reload() 해야 함.
 */
export async function restoreSnapshot(fileId: string): Promise<void> {
  const raw = await driveAdapter.readBackupRaw(fileId);
  const snap = raw as FullSnapshot;

  // ⚠️ 빈 배열([])은 truthy 다. 수집 당시 Drive 장애로 비어 버린 섹션을 그대로
  // 복원하면 살아있는 실데이터를 삭제하게 되므로, 내용이 있는 섹션만 복원한다.
  const hasItems = <T,>(v: T[] | undefined): v is T[] => Array.isArray(v) && v.length > 0;

  // ⚠️ 순서가 중요하다: Drive 를 먼저 쓰고, 전부 성공한 뒤에만 localCache 를 갱신한다.
  // 캐시를 먼저 바꾸면 Drive 쓰기가 실패했을 때 메모리에는 스냅샷이, Drive 에는 실데이터가
  // 남는 불일치가 생기고, 이후 정상 저장이 옛 스냅샷을 실데이터 위에 밀어 넣는다.

  // ── Drive 복원 (주요 파일 덮어쓰기) ──────────────────────────────────────
  const driveWrites: Promise<void>[] = [];

  if (snap.config) {
    driveWrites.push(driveAdapter.writeConfig(makeEnv('config', snap.config)));
  }
  if (hasItems(snap.accounts)) {
    driveWrites.push(driveAdapter.writeAccounts(makeEnv('accounts', snap.accounts)));
  }
  if (hasItems(snap.liabilities)) {
    driveWrites.push(driveAdapter.writeLiabilities(makeEnv('liabilities', snap.liabilities)));
  }
  if (hasItems(snap.settlementTransfers)) {
    driveWrites.push(
      driveAdapter.writeSettlementTransfers(makeEnv('settlement_transfers', snap.settlementTransfers)),
    );
  }
  if (hasItems(snap.resetSessions)) {
    driveWrites.push(
      driveAdapter.writeResetSessions(makeEnv('reset_sessions', snap.resetSessions)),
    );
  }
  for (const [ym, txs] of Object.entries(snap.transactions ?? {})) {
    driveWrites.push(driveAdapter.writeTransactions(ym, makeEnv(`transactions_${ym}`, txs)));
  }
  for (const [ym, ses] of Object.entries(snap.sharedExpenses ?? {})) {
    driveWrites.push(driveAdapter.writeSharedExpenses(ym, makeEnv(`shared_expenses_${ym}`, ses)));
  }
  if (hasItems(snap.recurringItems)) {
    driveWrites.push(
      driveAdapter.writeRecurringItems(makeEnv('recurring_items', snap.recurringItems)),
    );
  }
  for (const [ym, plan] of Object.entries(snap.budgetPlans ?? {})) {
    if (plan) {
      driveWrites.push(driveAdapter.writeBudgetPlan(ym, makeEnv('budget_plan', plan)));
    }
  }

  // ⚠️ 실패를 삼키면 안 된다. localCache 는 인메모리라 새로고침으로 사라지므로
  // 실제 영속 효과는 Drive 쓰기뿐이다. 전부 실패해도 "복원 완료"로 표시되면
  // 사용자는 복원됐다고 믿고 그 위에 새 데이터를 입력해 원본을 더 훼손한다.
  const results = await Promise.allSettled(driveWrites);
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    // 일부만 기록된 상태 → 메모리 캐시를 폐기해 반쪽 데이터가 이후 저장으로
    // Drive 에 밀려 들어가는 것을 막는다. 호출부는 이 에러를 받고 새로고침해야 한다.
    await localCache.clear();
    throw new Error(
      `복원 실패: ${results.length}개 항목 중 ${failed.length}개를 저장하지 못했습니다. ` +
      '네트워크 상태를 확인한 뒤 다시 시도해 주세요. ' +
      '(원본 백업 파일은 그대로 보존됩니다. 페이지를 새로고침해 주세요)',
    );
  }

  // ── Drive 기록 성공 → 이제 메모리 캐시 갱신 ──────────────────────────────
  if (snap.config)                        await localCache.setConfig(snap.config);
  if (hasItems(snap.accounts))            await localCache.setAccounts(snap.accounts);
  if (hasItems(snap.liabilities))         await localCache.setLiabilities(snap.liabilities);
  if (hasItems(snap.settlementTransfers)) await localCache.setSettlementTransfers(snap.settlementTransfers);
  if (hasItems(snap.resetSessions))       await localCache.setResetSessions(snap.resetSessions);
  if (hasItems(snap.recurringItems))      await localCache.setRecurringItems(snap.recurringItems);

  for (const [ym, txs] of Object.entries(snap.transactions ?? {})) {
    await localCache.setTransactions(ym, txs);
  }
  for (const [ym, ses] of Object.entries(snap.sharedExpenses ?? {})) {
    await localCache.setSharedExpenses(ym, ses);
  }
  for (const [ym, plan] of Object.entries(snap.budgetPlans ?? {})) {
    if (plan) {
      await localCache.setBudgetPlan(ym, plan);
    } else {
      await localCache.deleteBudgetPlan(ym);
    }
  }

  // 복원한 데이터가 로그인 시 오래된 로컬 사본에 덮어써지지 않도록 로컬 잔재 제거
  // (syncPendingToDrive / migrateLocalDataToDrive 가 옛 값을 다시 올리는 것 방지)
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith('reset-budget:')) localStorage.removeItem(key);
  }

  // 복원 완료 후 다음 실행에서 새 스냅샷 생성하도록 날짜 초기화
  localStorage.removeItem(SNAPSHOT_DATE_KEY);
}
