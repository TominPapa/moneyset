// Local Cache Interface — RESET Budget
// 스펙 Section 12 기준 (IndexedDB 기반)
// 이 파일은 인터페이스 정의만 포함한다. 실제 구현은 Phase 2에서 작성한다.

import type {
  AppConfig,
  Transaction,
  SharedExpense,
  SettlementTransfer,
  ResetSession,
  Account,
  Liability,
} from '../domain/types';
import type { AppState } from './driveAdapter';

// ─── IndexedDB Store 이름 ─────────────────────────────────────────────────────

export const STORE_NAMES = {
  config: 'config',
  accounts: 'accounts',
  liabilities: 'liabilities',
  transactions: 'transactions',       // key: `${ym}/${id}`
  sharedExpenses: 'shared_expenses',  // key: `${ym}/${id}`
  settlementTransfers: 'settlement_transfers',
  resetSessions: 'reset_sessions',
  appState: 'app_state',
  syncQueue: 'sync_queue',            // 저장 실패 항목 재시도 큐
} as const;

// ─── 동기화 큐 항목 ───────────────────────────────────────────────────────────

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
  addResetSession(session: ResetSession): Promise<void>;
  updateResetSession(session: ResetSession): Promise<void>;

  // 동기화 큐
  getSyncQueue(): Promise<SyncQueueItem[]>;
  addToSyncQueue(item: SyncQueueItem): Promise<void>;
  removeFromSyncQueue(id: string): Promise<void>;
}
