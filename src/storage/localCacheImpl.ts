// LocalCache 구현 — 인메모리 (Drive가 단일 진실 공급원)
//
// IndexedDB를 제거하고 세션 내 메모리 Map으로 대체.
// - 브라우저 새로고침 / 세션 종료 시 메모리 초기화
// - 재로그인 시 Drive에서 최신 데이터 재조회 (항상 최신)
// - 동시 Drive 호출 방지: 동일 키에 대한 fetch Promise를 공유(deduplicate)
//
// Drive 자동 조회 대상:
//   getTransactions(ym), getSharedExpenses(ym),
//   getSettlementTransfers(), getResetSessions()
//
// 로그인 시 appStore가 직접 주입하는 항목:
//   setAppState, setConfig, setAccounts, setLiabilities

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
import type { LocalCache, SyncQueueItem } from './localCache';
import type { AppState } from './driveAdapter';
import { driveAdapter } from './driveAdapterImpl';

export class LocalCacheImpl implements LocalCache {
  // ─── 인메모리 저장소 ───────────────────────────────────────────────────────
  private _appState: AppState | null = null;
  private _config: AppConfig | null = null;
  private _accounts: Account[] = [];
  private _liabilities: Liability[] = [];
  private _transactions = new Map<string, Transaction[]>();
  private _sharedExpenses = new Map<string, SharedExpense[]>();
  private _settlementTransfers: SettlementTransfer[] | null = null;
  private _resetSessions: ResetSession[] | null = null;
  private _budgetPlans = new Map<string, BudgetPlan | null>();
  private _recurringItems: RecurringItem[] | null = null;

  // ─── 중복 Drive 호출 방지 (Promise 공유) ─────────────────────────────────
  private _txFetching = new Map<string, Promise<Transaction[]>>();
  private _seFetching = new Map<string, Promise<SharedExpense[]>>();
  private _transfersFetching: Promise<SettlementTransfer[]> | null = null;
  private _resetFetching: Promise<ResetSession[]> | null = null;
  private _bpFetching = new Map<string, Promise<BudgetPlan | null>>();
  private _riFetching: Promise<RecurringItem[]> | null = null;

  // ─── 초기화 ───────────────────────────────────────────────────────────────

  async init(): Promise<void> { /* no-op — IndexedDB 불필요 */ }

  async clear(): Promise<void> {
    this._appState = null;
    this._config = null;
    this._accounts = [];
    this._liabilities = [];
    this._transactions.clear();
    this._sharedExpenses.clear();
    this._settlementTransfers = null;
    this._resetSessions = null;
    this._budgetPlans.clear();
    this._recurringItems = null;
    this._txFetching.clear();
    this._seFetching.clear();
    this._transfersFetching = null;
    this._resetFetching = null;
    this._bpFetching.clear();
    this._riFetching = null;
  }

  // ─── AppState ─────────────────────────────────────────────────────────────

  async getAppState(): Promise<AppState | null> { return this._appState; }
  async setAppState(state: AppState): Promise<void> { this._appState = state; }

  // ─── AppConfig ────────────────────────────────────────────────────────────

  async getConfig(): Promise<AppConfig | null> { return this._config; }
  async setConfig(config: AppConfig): Promise<void> { this._config = config; }

  // ─── 자산/부채 ─────────────────────────────────────────────────────────────

  async getAccounts(): Promise<Account[]> { return this._accounts; }
  async setAccounts(accounts: Account[]): Promise<void> { this._accounts = accounts; }

  async getLiabilities(): Promise<Liability[]> { return this._liabilities; }
  async setLiabilities(liabilities: Liability[]): Promise<void> { this._liabilities = liabilities; }

  // ─── 거래 (Drive 자동 조회) ───────────────────────────────────────────────

  async getTransactions(ym: string): Promise<Transaction[]> {
    if (this._transactions.has(ym)) return this._transactions.get(ym)!;
    if (this._txFetching.has(ym)) return this._txFetching.get(ym)!;

    const p = driveAdapter.readTransactions(ym)
      .then((env) => {
        const txs = Array.isArray(env?.data) ? (env.data as Transaction[]) : [];
        this._transactions.set(ym, txs);
        this._txFetching.delete(ym);
        return txs;
      })
      .catch((err) => {
        this._txFetching.delete(ym);
        console.warn(`[LocalCache] Failed to fetch transactions for ${ym}:`, err);
        return [] as Transaction[];
      });

    this._txFetching.set(ym, p);
    return p;
  }

  async setTransactions(ym: string, transactions: Transaction[]): Promise<void> {
    this._transactions.set(ym, transactions);
  }

  async upsertTransaction(ym: string, tx: Transaction): Promise<void> {
    const list = await this.getTransactions(ym);
    const idx = list.findIndex((t) => t.id === tx.id);
    if (idx >= 0) list[idx] = tx; else list.push(tx);
    this._transactions.set(ym, list);
  }

  async deleteTransaction(ym: string, id: string): Promise<void> {
    const list = await this.getTransactions(ym);
    this._transactions.set(ym, list.filter((t) => t.id !== id));
  }

  // ─── 공동지출 (Drive 자동 조회) ───────────────────────────────────────────

  async getSharedExpenses(ym: string): Promise<SharedExpense[]> {
    if (this._sharedExpenses.has(ym)) return this._sharedExpenses.get(ym)!;
    if (this._seFetching.has(ym)) return this._seFetching.get(ym)!;

    const p = driveAdapter.readSharedExpenses(ym)
      .then((env) => {
        const ses = Array.isArray(env?.data) ? (env.data as SharedExpense[]) : [];
        this._sharedExpenses.set(ym, ses);
        this._seFetching.delete(ym);
        return ses;
      })
      .catch((err) => {
        this._seFetching.delete(ym);
        console.warn(`[LocalCache] Failed to fetch shared expenses for ${ym}:`, err);
        return [] as SharedExpense[];
      });

    this._seFetching.set(ym, p);
    return p;
  }

  async setSharedExpenses(ym: string, expenses: SharedExpense[]): Promise<void> {
    this._sharedExpenses.set(ym, expenses);
  }

  async upsertSharedExpense(ym: string, expense: SharedExpense): Promise<void> {
    const list = await this.getSharedExpenses(ym);
    const idx = list.findIndex((e) => e.id === expense.id);
    if (idx >= 0) list[idx] = expense; else list.push(expense);
    this._sharedExpenses.set(ym, list);
  }

  // ─── 정산 송금 (Drive 자동 조회) ─────────────────────────────────────────

  async getSettlementTransfers(): Promise<SettlementTransfer[]> {
    if (this._settlementTransfers !== null) return this._settlementTransfers;
    if (this._transfersFetching) return this._transfersFetching;

    this._transfersFetching = driveAdapter.readSettlementTransfers()
      .then((env) => {
        const transfers = Array.isArray(env?.data) ? (env.data as SettlementTransfer[]) : [];
        this._settlementTransfers = transfers;
        this._transfersFetching = null;
        return transfers;
      })
      .catch((err) => {
        this._transfersFetching = null;
        console.warn('[LocalCache] Failed to fetch settlement transfers:', err);
        return [] as SettlementTransfer[];
      });

    return this._transfersFetching;
  }

  async setSettlementTransfers(transfers: SettlementTransfer[]): Promise<void> {
    this._settlementTransfers = transfers;
  }

  async addSettlementTransfer(transfer: SettlementTransfer): Promise<void> {
    const list = await this.getSettlementTransfers();
    list.push(transfer);
    this._settlementTransfers = list;
  }

  // ─── 리셋 세션 (Drive 자동 조회) ─────────────────────────────────────────

  async getResetSessions(): Promise<ResetSession[]> {
    if (this._resetSessions !== null) return this._resetSessions;
    if (this._resetFetching) return this._resetFetching;

    this._resetFetching = driveAdapter.readResetSessions()
      .then((env) => {
        const sessions = Array.isArray(env?.data) ? (env.data as ResetSession[]) : [];
        this._resetSessions = sessions;
        this._resetFetching = null;
        return sessions;
      })
      .catch((err) => {
        this._resetFetching = null;
        console.warn('[LocalCache] Failed to fetch reset sessions:', err);
        return [] as ResetSession[];
      });

    return this._resetFetching;
  }

  async setResetSessions(sessions: ResetSession[]): Promise<void> {
    this._resetSessions = sessions;
  }

  async addResetSession(session: ResetSession): Promise<void> {
    const list = await this.getResetSessions();
    list.push(session);
    this._resetSessions = list;
  }

  async updateResetSession(session: ResetSession): Promise<void> {
    const list = await this.getResetSessions();
    const idx = list.findIndex((s) => s.id === session.id);
    if (idx < 0) throw new Error(`ResetSession not found: ${session.id}`);
    list[idx] = session;
    this._resetSessions = list;
  }

  // ─── 예산 계획 (월별) ─────────────────────────────────────────────────────

  async getBudgetPlan(ym: string): Promise<BudgetPlan | null> {
    if (this._budgetPlans.has(ym)) return this._budgetPlans.get(ym)!;
    if (this._bpFetching.has(ym)) return this._bpFetching.get(ym)!;

    const p = driveAdapter.readBudgetPlan(ym)
      .then((env) => {
        const plan = env?.data ?? null;
        this._budgetPlans.set(ym, plan);
        this._bpFetching.delete(ym);
        return plan;
      })
      .catch((err) => {
        this._bpFetching.delete(ym);
        throw err;
      });

    this._bpFetching.set(ym, p);
    return p;
  }

  async setBudgetPlan(ym: string, plan: BudgetPlan): Promise<void> {
    this._budgetPlans.set(ym, plan);
  }

  async deleteBudgetPlan(ym: string): Promise<void> {
    this._budgetPlans.set(ym, null);
  }

  // ─── 정기지출 항목 (전체) ─────────────────────────────────────────────────

  async getRecurringItems(): Promise<RecurringItem[]> {
    if (this._recurringItems !== null) return this._recurringItems;
    if (this._riFetching) return this._riFetching;

    this._riFetching = driveAdapter.readRecurringItems()
      .then((env) => {
        const items = Array.isArray(env?.data) ? (env.data as RecurringItem[]) : [];
        this._recurringItems = items;
        this._riFetching = null;
        return items;
      })
      .catch((err) => {
        this._riFetching = null;
        throw err;
      });

    return this._riFetching;
  }

  async setRecurringItems(items: RecurringItem[]): Promise<void> {
    this._recurringItems = items;
  }

  // ─── 동기화 큐 (인터페이스 호환 — no-op) ─────────────────────────────────
  // Drive가 단일 진실 공급원이므로 별도의 재시도 큐 불필요

  async getSyncQueue(): Promise<SyncQueueItem[]> { return []; }
  async addToSyncQueue(_item: SyncQueueItem): Promise<void> { /* no-op */ }
  async removeFromSyncQueue(_id: string): Promise<void> { /* no-op */ }
}

// 싱글턴
export const localCache = new LocalCacheImpl();
