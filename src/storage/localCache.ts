// Local Cache Interface — RESET Budget
// 스토리지 아키텍처: Drive (단일 진실 공급원) → 인메모리 Map (세션 캐시)
// IndexedDB 제거됨. 실제 구현은 localCacheImpl.ts 참조.

import type {
  AppConfig,
  Transaction,
  SharedExpense,
  SettlementTransfer,
  ResetSession,
  Account,
  Liability,
  BudgetPlan,
  RecurringItem,
} from '../domain/types';
import type { AppState } from './driveAdapter';

// ─── 동기화 큐 항목 (인터페이스 호환용 — 실질적으로 no-op) ─────────────────────

export type SyncQueueItemType =
  | 'config'
  | 'accounts'
  | 'liabilities'
  | 'transactions'
  | 'shared_expenses'
  | 'settlement_transfers'
  | 'reset_sessions';

export interface SyncQueueItem {
  id: string;
  type: SyncQueueItemType;
  ym?: string;           // 월별 파일인 경우
  failedAt: string;
  retryCount: number;
}

// ─── Local Cache 인터페이스 ───────────────────────────────────────────────────

export interface LocalCache {
  // 초기화
  init(): Promise<void>;
  clear(): Promise<void>;

  // AppState
  getAppState(): Promise<AppState | null>;
  setAppState(state: AppState): Promise<void>;

  // AppConfig
  getConfig(): Promise<AppConfig | null>;
  setConfig(config: AppConfig): Promise<void>;

  // 자산/부채
  getAccounts(): Promise<Account[]>;
  setAccounts(accounts: Account[]): Promise<void>;
  getLiabilities(): Promise<Liability[]>;
  setLiabilities(liabilities: Liability[]): Promise<void>;

  // 거래 (월별)
  getTransactions(ym: string): Promise<Transaction[]>;
  setTransactions(ym: string, transactions: Transaction[]): Promise<void>;
  upsertTransaction(ym: string, tx: Transaction): Promise<void>;
  deleteTransaction(ym: string, id: string): Promise<void>;

  // 공동지출 (월별)
  getSharedExpenses(ym: string): Promise<SharedExpense[]>;
  setSharedExpenses(ym: string, expenses: SharedExpense[]): Promise<void>;
  upsertSharedExpense(ym: string, expense: SharedExpense): Promise<void>;

  // 정산 송금
  getSettlementTransfers(): Promise<SettlementTransfer[]>;
  setSettlementTransfers(transfers: SettlementTransfer[]): Promise<void>;
  addSettlementTransfer(transfer: SettlementTransfer): Promise<void>;

  // 리셋 세션
  getResetSessions(): Promise<ResetSession[]>;
  setResetSessions(sessions: ResetSession[]): Promise<void>;
  addResetSession(session: ResetSession): Promise<void>;
  updateResetSession(session: ResetSession): Promise<void>;

  // 예산 계획 (월별)
  getBudgetPlan(ym: string): Promise<BudgetPlan | null>;
  setBudgetPlan(ym: string, plan: BudgetPlan): Promise<void>;
  deleteBudgetPlan(ym: string): Promise<void>;

  // 정기지출 항목 (전체)
  getRecurringItems(): Promise<RecurringItem[]>;
  setRecurringItems(items: RecurringItem[]): Promise<void>;

  // 동기화 큐
  getSyncQueue(): Promise<SyncQueueItem[]>;
  addToSyncQueue(item: SyncQueueItem): Promise<void>;
  removeFromSyncQueue(id: string): Promise<void>;
}
