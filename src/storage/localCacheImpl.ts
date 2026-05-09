// LocalCache 구현 — IndexedDB (idb 라이브러리)
// 스펙 Section 12 기준

import { openDB, type IDBPDatabase } from 'idb';
import type {
  AppConfig,
  Transaction,
  SharedExpense,
  SettlementTransfer,
  ResetSession,
  Account,
  Liability,
} from '../domain/types';
import type { LocalCache, SyncQueueItem } from './localCache';
import { STORE_NAMES } from './localCache';
import type { AppState } from './driveAdapter';

const DB_NAME = 'reset-budget';
const DB_VERSION = 1;

type DB = IDBPDatabase;

async function getDB(): Promise<DB> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAMES.config)) {
        db.createObjectStore(STORE_NAMES.config);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.accounts)) {
        db.createObjectStore(STORE_NAMES.accounts);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.liabilities)) {
        db.createObjectStore(STORE_NAMES.liabilities);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.transactions)) {
        db.createObjectStore(STORE_NAMES.transactions);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.sharedExpenses)) {
        db.createObjectStore(STORE_NAMES.sharedExpenses);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.settlementTransfers)) {
        db.createObjectStore(STORE_NAMES.settlementTransfers);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.resetSessions)) {
        db.createObjectStore(STORE_NAMES.resetSessions);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.appState)) {
        db.createObjectStore(STORE_NAMES.appState);
      }
      if (!db.objectStoreNames.contains(STORE_NAMES.syncQueue)) {
        db.createObjectStore(STORE_NAMES.syncQueue, { keyPath: 'id' });
      }
    },
  });
}

export class LocalCacheImpl implements LocalCache {
  private db: DB | null = null;

  async init(): Promise<void> {
    this.db = await getDB();
  }

  private get store(): DB {
    if (!this.db) throw new Error('LocalCache 미초기화. init()을 먼저 호출하세요.');
    return this.db;
  }

  async clear(): Promise<void> {
    const db = this.store;
    const tx = db.transaction(Object.values(STORE_NAMES), 'readwrite');
    await Promise.all(Object.values(STORE_NAMES).map(name => tx.objectStore(name).clear()));
    await tx.done;
  }

  // ─── AppState ─────────────────────────────────────────────────────────────

  async getAppState(): Promise<AppState | null> {
    return (await this.store.get(STORE_NAMES.appState, 'state')) ?? null;
  }

  async setAppState(state: AppState): Promise<void> {
    await this.store.put(STORE_NAMES.appState, state, 'state');
  }

  // ─── AppConfig ────────────────────────────────────────────────────────────

  async getConfig(): Promise<AppConfig | null> {
    return (await this.store.get(STORE_NAMES.config, 'config')) ?? null;
  }

  async setConfig(config: AppConfig): Promise<void> {
    await this.store.put(STORE_NAMES.config, config, 'config');
  }

  // ─── 자산/부채 ─────────────────────────────────────────────────────────────

  async getAccounts(): Promise<Account[]> {
    return (await this.store.get(STORE_NAMES.accounts, 'list')) ?? [];
  }

  async setAccounts(accounts: Account[]): Promise<void> {
    await this.store.put(STORE_NAMES.accounts, accounts, 'list');
  }

  async getLiabilities(): Promise<Liability[]> {
    return (await this.store.get(STORE_NAMES.liabilities, 'list')) ?? [];
  }

  async setLiabilities(liabilities: Liability[]): Promise<void> {
    await this.store.put(STORE_NAMES.liabilities, liabilities, 'list');
  }

  // ─── 거래 ─────────────────────────────────────────────────────────────────

  async getTransactions(ym: string): Promise<Transaction[]> {
    return (await this.store.get(STORE_NAMES.transactions, ym)) ?? [];
  }

  async setTransactions(ym: string, transactions: Transaction[]): Promise<void> {
    await this.store.put(STORE_NAMES.transactions, transactions, ym);
  }

  async upsertTransaction(ym: string, tx: Transaction): Promise<void> {
    const list = await this.getTransactions(ym);
    const idx = list.findIndex(t => t.id === tx.id);
    if (idx >= 0) list[idx] = tx;
    else list.push(tx);
    await this.setTransactions(ym, list);
  }

  async deleteTransaction(ym: string, id: string): Promise<void> {
    const list = await this.getTransactions(ym);
    await this.setTransactions(ym, list.filter(t => t.id !== id));
  }

  // ─── 공동지출 ─────────────────────────────────────────────────────────────

  async getSharedExpenses(ym: string): Promise<SharedExpense[]> {
    return (await this.store.get(STORE_NAMES.sharedExpenses, ym)) ?? [];
  }

  async setSharedExpenses(ym: string, expenses: SharedExpense[]): Promise<void> {
    await this.store.put(STORE_NAMES.sharedExpenses, expenses, ym);
  }

  async upsertSharedExpense(ym: string, expense: SharedExpense): Promise<void> {
    const list = await this.getSharedExpenses(ym);
    const idx = list.findIndex(e => e.id === expense.id);
    if (idx >= 0) list[idx] = expense;
    else list.push(expense);
    await this.setSharedExpenses(ym, list);
  }

  // ─── 정산 송금 ────────────────────────────────────────────────────────────

  async getSettlementTransfers(): Promise<SettlementTransfer[]> {
    return (await this.store.get(STORE_NAMES.settlementTransfers, 'list')) ?? [];
  }

  async setSettlementTransfers(transfers: SettlementTransfer[]): Promise<void> {
    await this.store.put(STORE_NAMES.settlementTransfers, transfers, 'list');
  }

  async addSettlementTransfer(transfer: SettlementTransfer): Promise<void> {
    const list = await this.getSettlementTransfers();
    list.push(transfer);
    await this.setSettlementTransfers(list);
  }

  // ─── 리셋 세션 ────────────────────────────────────────────────────────────

  async getResetSessions(): Promise<ResetSession[]> {
    return (await this.store.get(STORE_NAMES.resetSessions, 'list')) ?? [];
  }

  async addResetSession(session: ResetSession): Promise<void> {
    const list = await this.getResetSessions();
    list.push(session);
    await this.store.put(STORE_NAMES.resetSessions, list, 'list');
  }

  async updateResetSession(session: ResetSession): Promise<void> {
    const list = await this.getResetSessions();
    const idx = list.findIndex(s => s.id === session.id);
    if (idx < 0) throw new Error(`ResetSession not found: ${session.id}`);
    list[idx] = session;
    await this.store.put(STORE_NAMES.resetSessions, list, 'list');
  }

  // ─── 동기화 큐 ────────────────────────────────────────────────────────────

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    return await this.store.getAll(STORE_NAMES.syncQueue);
  }

  async addToSyncQueue(item: SyncQueueItem): Promise<void> {
    await this.store.put(STORE_NAMES.syncQueue, item);
  }

  async removeFromSyncQueue(id: string): Promise<void> {
    await this.store.delete(STORE_NAMES.syncQueue, id);
  }
}

// 싱글턴
export const localCache = new LocalCacheImpl();
