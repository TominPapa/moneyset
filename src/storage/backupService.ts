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
  const txResults = await runInChunks(months, 4, async (ym) => ({
    ym,
    data: await localCache.getTransactions(ym),
  }));

  const seResults = await runInChunks(months, 4, async (ym) => ({
    ym,
    data: await localCache.getSharedExpenses(ym),
  }));

  const bpResults = await runInChunks(months, 4, async (ym) => ({
    ym,
    data: await localCache.getBudgetPlan(ym),
  }));

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
  const today = new Date().toISOString().slice(0, 10);
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
  const today = new Date().toISOString().slice(0, 10);
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

  // ── localCache 복원 ────────────────────────────────────────────────────────
  if (snap.config)               await localCache.setConfig(snap.config);
  if (snap.accounts)             await localCache.setAccounts(snap.accounts);
  if (snap.liabilities)          await localCache.setLiabilities(snap.liabilities);
  if (snap.settlementTransfers)  await localCache.setSettlementTransfers(snap.settlementTransfers);
  if (snap.resetSessions)        await localCache.setResetSessions(snap.resetSessions);
  if (snap.recurringItems)       await localCache.setRecurringItems(snap.recurringItems);

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

  // ── Drive 복원 (주요 파일 덮어쓰기) ──────────────────────────────────────
  const driveWrites: Promise<void>[] = [];

  if (snap.config) {
    driveWrites.push(driveAdapter.writeConfig(makeEnv('config', snap.config)));
  }
  if (snap.accounts) {
    driveWrites.push(driveAdapter.writeAccounts(makeEnv('accounts', snap.accounts)));
  }
  if (snap.liabilities) {
    driveWrites.push(driveAdapter.writeLiabilities(makeEnv('liabilities', snap.liabilities)));
  }
  if (snap.settlementTransfers) {
    driveWrites.push(
      driveAdapter.writeSettlementTransfers(makeEnv('settlement_transfers', snap.settlementTransfers)),
    );
  }
  if (snap.resetSessions) {
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
  if (snap.recurringItems) {
    driveWrites.push(
      driveAdapter.writeRecurringItems(makeEnv('recurring_items', snap.recurringItems)),
    );
  }
  for (const [ym, plan] of Object.entries(snap.budgetPlans ?? {})) {
    if (plan) {
      driveWrites.push(driveAdapter.writeBudgetPlan(ym, makeEnv('budget_plan', plan)));
    }
  }

  await Promise.allSettled(driveWrites);

  // 복원 완료 후 다음 실행에서 새 스냅샷 생성하도록 날짜 초기화
  localStorage.removeItem(SNAPSHOT_DATE_KEY);
}
