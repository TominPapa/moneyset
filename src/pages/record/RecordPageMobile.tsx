// RecordPageMobile — 모바일 전용 거래 기록 화면
// 단일 열 카드 UI, 상단 요약 대시보드, 가로 스크롤 카테고리 필터 칩, 플로팅 버튼(FAB)

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { TransactionForm } from './TransactionForm';
import { TransactionItem } from './TransactionItem';
import { useDriveSync } from '../../hooks/useDriveSync';
import {
  IcChevronLeft, IcChevronRight, IcPlus,
} from '../../components/ui/Icons';
import type { Transaction, SharedExpense, SplitMode, Account } from '../../domain/types';
import { calcSplit } from '../../domain/sharedSettlement';
import { getBudgetPeriodForMonth, getMonthsInPeriod, toLocalDateStr } from '../../domain/safetyUtils';
import styles from './RecordPageMobile.module.css';

// ─── utils ────────────────────────────────────────────────────────────────────

function makeEnvelope<T>(fileType: string, data: T) {
  return { schemaVersion: '1.0', fileType, updatedAt: new Date().toISOString(), revisionHint: crypto.randomUUID(), data };
}
function prevYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function groupByDate(txs: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const tx of [...txs].sort((a, b) => b.date.localeCompare(a.date))) {
    const list = map.get(tx.date) ?? [];
    list.push(tx);
    map.set(tx.date, list);
  }
  return map;
}

function adjustBalancesForSave(
  accounts: Account[],
  tx: Transaction,
  initial?: Transaction
): Account[] {
  return accounts.map((acc) => {
    let balance = acc.balance;

    if (initial && initial.accountId === acc.id) {
      if (initial.entryKind === 'expense') {
        balance += initial.amount;
      } else if (initial.entryKind === 'income') {
        balance -= initial.amount;
      }
    }

    if (tx.accountId === acc.id) {
      if (tx.entryKind === 'expense') {
        balance -= tx.amount;
      } else if (tx.entryKind === 'income') {
        balance += tx.amount;
      }
    }

    if (balance === acc.balance) return acc;
    return {
      ...acc,
      balance,
      lastUpdatedAt: new Date().toISOString(),
    };
  });
}

function adjustBalancesForDelete(
  accounts: Account[],
  tx: Transaction
): Account[] {
  return accounts.map((acc) => {
    let balance = acc.balance;

    if (tx.accountId === acc.id) {
      if (tx.entryKind === 'expense') {
        balance += tx.amount;
      } else if (tx.entryKind === 'income') {
        balance -= tx.amount;
      }
    }

    if (balance === acc.balance) return acc;
    return {
      ...acc,
      balance,
      lastUpdatedAt: new Date().toISOString(),
    };
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}
function fmt(n: number): string { return n.toLocaleString('ko-KR') + '원'; }
function fmtSigned(n: number): string { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ko-KR') + '원'; }

const TOKEN_COLORS: Record<string, string> = {
  amber: '#F4A26B', brown: '#D4A876', coral: '#F08080', indigo: '#9DB6F0',
  blue: '#8AB6F0', gray: '#8F8D85', slate: '#8AB0C4', green: '#9DD19D',
  teal: '#7BC4D9', purple: '#C9A6F0', red: '#F47272', yellow: '#F0D070',
  orange: '#F4A060', emerald: '#3FD6A4', lime: '#A8D96C',
};
const CAT_PALETTE = [
  '#F4A26B','#8AB6F0','#D9B26A','#9DD19D','#C9A6F0',
  '#7BC4D9','#F08080','#F0D070','#D4A876','#8AC4B0',
];
function catColor(id: string, colorToken?: string): string {
  if (colorToken && TOKEN_COLORS[colorToken]) return TOKEN_COLORS[colorToken];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return CAT_PALETTE[h % CAT_PALETTE.length];
}

type FilterKind = 'all' | 'expense' | 'income';

export function RecordPageMobile() {
  const activeMonth    = useAppStore(s => s.activeMonth);
  const setActiveMonth = useAppStore(s => s.setActiveMonth);
  const config         = useAppStore(s => s.config);
  const lastSyncedAt   = useAppStore(s => s.lastSyncedAt);
  const accounts       = useAppStore(s => s.accounts);
  const setAccounts    = useAppStore(s => s.setAccounts);

  const [transactions, setTransactions]   = useState<Transaction[]>([]);
  const [loading, setLoading]             = useState(true);
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [editing, setEditing]             = useState<Transaction | undefined>();
  const [filterKind, setFilterKind]       = useState<FilterKind>('all');
  const [filterCategoryId, setFilterCat]  = useState<string>('');

  const { schedule: scheduleDrive, flush: flushDrive } = useDriveSync(1500);

  useEffect(() => { return () => { void flushDrive(); }; }, [flushDrive]);
  useEffect(() => {
    setLoading(true);
    const { start, end } = getBudgetPeriodForMonth(activeMonth, config);
    const months = getMonthsInPeriod(start, end);
    const startStr = toLocalDateStr(start);
    const endStr = toLocalDateStr(end);

    Promise.all(months.map(ym => localCache.getTransactions(ym)))
      .then((results) => {
        const allTxs = results.flat();
        const filtered = allTxs.filter(t => t.date >= startStr && t.date <= endStr);
        setTransactions(filtered);
      })
      .finally(() => setLoading(false));
  }, [activeMonth, lastSyncedAt, config]);

  const handleSave = useCallback(async (
    tx: Transaction,
    counterpartyId?: string,
    splitMode?: SplitMode,
    myRatio?: number,
    myCustomAmount?: number
  ) => {
    const initial = editing;
    const targetYM = tx.date.slice(0, 7);
    const initialYM = initial ? initial.date.slice(0, 7) : targetYM;

    if (tx.sharedExpenseId && (!tx.isShared || !counterpartyId)) {
      const seList = await localCache.getSharedExpenses(initialYM);
      const filtered = seList.filter(se => se.id !== tx.sharedExpenseId);
      await localCache.setSharedExpenses(initialYM, filtered);
      tx = { ...tx, sharedExpenseId: undefined };
      scheduleDrive(async () => {
        const updated = await localCache.getSharedExpenses(initialYM);
        await driveAdapter.writeSharedExpenses(initialYM, makeEnvelope(`shared/${initialYM}.shared-expenses.json`, updated));
      });
    }
    if (tx.isShared && counterpartyId) {
      const now = new Date().toISOString();
      const mode = splitMode ?? 'equal';
      const { myShareAmount, counterpartyShareAmount } = calcSplit(tx.amount, mode, myRatio, myCustomAmount);

      const seList = await localCache.getSharedExpenses(targetYM);
      const existing = seList.find(se => se.id === tx.sharedExpenseId);

      if (existing) {
        const updatedSe: SharedExpense = {
          ...existing,
          counterpartyId,
          splitMode: mode,
          myShareAmount: Math.round(myShareAmount),
          counterpartyShareAmount: Math.round(counterpartyShareAmount),
          updatedAt: now,
        };
        await localCache.upsertSharedExpense(targetYM, updatedSe);
      } else {
        const expense: SharedExpense = {
          id: `se_${crypto.randomUUID()}`, transactionId: tx.id,
          counterpartyId, paidBy: 'me', splitMode: mode,
          myShareAmount: Math.round(myShareAmount), counterpartyShareAmount: Math.round(counterpartyShareAmount),
          settledInAmount: 0, settledOutAmount: 0, status: 'open', createdAt: now, updatedAt: now,
        };
        tx = { ...tx, sharedExpenseId: expense.id };
        await localCache.upsertSharedExpense(targetYM, expense);
      }

      if (initial && initialYM !== targetYM && initial.sharedExpenseId) {
        const prevSeList = await localCache.getSharedExpenses(initialYM);
        const filteredPrevSe = prevSeList.filter(se => se.id !== initial.sharedExpenseId);
        await localCache.setSharedExpenses(initialYM, filteredPrevSe);
        scheduleDrive(async () => {
          const updatedPrev = await localCache.getSharedExpenses(initialYM);
          await driveAdapter.writeSharedExpenses(initialYM, makeEnvelope(`shared/${initialYM}.shared-expenses.json`, updatedPrev));
        });
      }

      scheduleDrive(async () => {
        const updated = await localCache.getSharedExpenses(targetYM);
        await driveAdapter.writeSharedExpenses(targetYM, makeEnvelope(`shared/${targetYM}.shared-expenses.json`, updated));
      });
    }

    const updatedAccounts = adjustBalancesForSave(accounts, tx, initial);
    setAccounts(updatedAccounts);
    await localCache.setAccounts(updatedAccounts);

    if (initial && initialYM !== targetYM) {
      await localCache.deleteTransaction(initialYM, initial.id);
      scheduleDrive(async () => {
        const latestPrev = await localCache.getTransactions(initialYM);
        await driveAdapter.writeTransactions(initialYM, makeEnvelope(`months/${initialYM}.transactions.json`, latestPrev));
      });
    }

    await localCache.upsertTransaction(targetYM, tx);

    const { start, end } = getBudgetPeriodForMonth(activeMonth, config);
    const months = getMonthsInPeriod(start, end);
    const results = await Promise.all(months.map(ym => localCache.getTransactions(ym)));
    const allTxs = results.flat();
    const startStr = toLocalDateStr(start);
    const endStr = toLocalDateStr(end);
    setTransactions(allTxs.filter(t => t.date >= startStr && t.date <= endStr));

    setSheetOpen(false);
    setEditing(undefined);
    scheduleDrive(async () => {
      const latest = await localCache.getTransactions(targetYM);
      await Promise.all([
        driveAdapter.writeTransactions(targetYM, makeEnvelope(`months/${targetYM}.transactions.json`, latest)),
        driveAdapter.writeAccounts(makeEnvelope('accounts.json', updatedAccounts)),
      ]);
    });
  }, [activeMonth, accounts, setAccounts, editing, scheduleDrive, config]);

  const handleDelete = useCallback(async (id: string) => {
    const target = transactions.find(t => t.id === id);
    if (!target) return;
    const targetYM = target.date.slice(0, 7);

    if (target.sharedExpenseId) {
      const seList = await localCache.getSharedExpenses(targetYM);
      const filtered = seList.filter(se => se.id !== target.sharedExpenseId);
      await localCache.setSharedExpenses(targetYM, filtered);
      scheduleDrive(async () => {
        const updated = await localCache.getSharedExpenses(targetYM);
        await driveAdapter.writeSharedExpenses(targetYM, makeEnvelope(`shared/${targetYM}.shared-expenses.json`, updated));
      });
    }

    const updatedAccounts = adjustBalancesForDelete(accounts, target);
    setAccounts(updatedAccounts);
    await localCache.setAccounts(updatedAccounts);

    await localCache.deleteTransaction(targetYM, id);

    const { start, end } = getBudgetPeriodForMonth(activeMonth, config);
    const months = getMonthsInPeriod(start, end);
    const results = await Promise.all(months.map(ym => localCache.getTransactions(ym)));
    const allTxs = results.flat();
    const startStr = toLocalDateStr(start);
    const endStr = toLocalDateStr(end);
    setTransactions(allTxs.filter(t => t.date >= startStr && t.date <= endStr));

    setSheetOpen(false);
    setEditing(undefined);
    scheduleDrive(async () => {
      const latest = await localCache.getTransactions(targetYM);
      await Promise.all([
        driveAdapter.writeTransactions(targetYM, makeEnvelope(`months/${targetYM}.transactions.json`, latest)),
        driveAdapter.writeAccounts(makeEnvelope('accounts.json', updatedAccounts)),
      ]);
    });
  }, [activeMonth, accounts, setAccounts, scheduleDrive, transactions, config]);

  const handleEdit = (tx: Transaction) => { setEditing(tx); setSheetOpen(true); };
  const handleAdd  = () => { setEditing(undefined); setSheetOpen(true); };

  const totalIncome  = transactions.filter(t => t.entryKind === 'income').reduce((s,t) => s+t.amount, 0);
  const totalExpense = transactions.filter(t => t.entryKind === 'expense').reduce((s,t) => s+t.amount, 0);
  const net          = totalIncome - totalExpense;
  const { start: periodStart, end: periodEnd } = getBudgetPeriodForMonth(activeMonth, config);

  const categoryMap = useMemo(() => new Map(config.categories.map(c => [c.id, c])), [config.categories]);

  const catExpenseMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.entryKind !== 'expense') continue;
      m.set(tx.categoryId, (m.get(tx.categoryId) ?? 0) + tx.amount);
    }
    return m;
  }, [transactions]);

  const topCategories = useMemo(() =>
    Array.from(catExpenseMap.entries())
      .map(([catId, total]) => ({ catId, total, cat: categoryMap.get(catId) }))
      .sort((a,b) => b.total - a.total),
    [catExpenseMap, categoryMap],
  );

  const filtered = useMemo(() => {
    let list = transactions;
    if (filterKind !== 'all') list = list.filter(t => t.entryKind === filterKind);
    if (filterCategoryId) list = list.filter(t => t.categoryId === filterCategoryId);
    return list;
  }, [transactions, filterKind, filterCategoryId]);

  const grouped = groupByDate(filtered);

  return (
    <div className={styles.page}>
      {/* 상단 헤더 / 월 변경 */}
      <header className={styles.header}>
        <div className={styles.headerTitleRow}>
          <span className={styles.pageTitle}>기록</span>
          <div className={styles.monthNav}>
            <button className={styles.navBtn} onClick={() => setActiveMonth(prevYM(activeMonth))} type="button">
              <IcChevronLeft size={16} />
            </button>
            <span className={styles.monthLabel}>{activeMonth.replace('-', '.')}</span>
            <button className={styles.navBtn} onClick={() => setActiveMonth(nextYM(activeMonth))} type="button">
              <IcChevronRight size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* 요약 카드 */}
      <section className={styles.summaryCard}>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>수입</span>
            <span className={styles.summaryValIncome}>+{fmt(totalIncome)}</span>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>지출</span>
            <span className={styles.summaryValExpense}>-{fmt(totalExpense)}</span>
          </div>
        </div>
        <div className={styles.netSummary}>
          <span className={styles.netLabel}>순잔액</span>
          <span className={net >= 0 ? styles.netValPlus : styles.netValMinus}>
            {fmtSigned(net)}
          </span>
        </div>
      </section>

      {/* 가로 스크롤 카테고리 필터 */}
      {topCategories.length > 0 && (
        <section className={styles.catChipsWrapper}>
          <div className={styles.catChipsScroll}>
            <button
              className={`${styles.catChip} ${filterCategoryId === '' ? styles.catChipActive : ''}`}
              onClick={() => setFilterCat('')}
              type="button"
            >
              전체 카테고리
            </button>
            {topCategories.map(({ catId, total, cat }) => {
              const isActive = filterCategoryId === catId;
              const color = catColor(catId, cat?.colorToken);
              return (
                <button
                  key={catId}
                  className={`${styles.catChip} ${isActive ? styles.catChipActive : ''}`}
                  onClick={() => setFilterCat(isActive ? '' : catId)}
                  style={isActive ? { background: color, color: '#fff' } : {}}
                  type="button"
                >
                  <span className={styles.catIcon}>{cat?.icon ?? '●'}</span>
                  <span>{cat?.name ?? '미분류'}</span>
                  <span className={styles.catAmt}>{fmt(total)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 필터 탭 (전체/지출/수입) */}
      <section className={styles.filterTabs}>
        {([['all', '전체'], ['expense', '지출'], ['income', '수입']] as const).map(([id, label]) => (
          <button
            key={id}
            className={`${styles.filterTab} ${filterKind === id ? styles.filterTabActive : ''}`}
            onClick={() => setFilterKind(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </section>

      {/* 거래 리스트 */}
      <main className={styles.mainContent}>
        {loading ? (
          <div className={styles.emptyState}>
            <p>데이터를 불러오는 중...</p>
          </div>
        ) : grouped.size === 0 ? (
          <div className={styles.emptyState}>
            <p>등록된 거래 내역이 없습니다.</p>
            <button className={styles.addIntroBtn} onClick={handleAdd} type="button">
              <IcPlus size={14} /> 첫 거래 기록하기
            </button>
          </div>
        ) : (
          <div className={styles.txList}>
            {Array.from(grouped.entries()).map(([date, txs]) => {
              const dayTotal = txs.reduce((s, t) => s + (t.entryKind === 'income' ? t.amount : -t.amount), 0);
              return (
                <div key={date} className={styles.dateGroup}>
                  <div className={styles.dateHeader}>
                    <span className={styles.dateLabel}>{formatDate(date)}</span>
                    <span className={dayTotal > 0 ? styles.dateTotalPlus : styles.dateTotalMinus}>
                      {fmtSigned(dayTotal)}
                    </span>
                  </div>
                  <div className={styles.dateGroupItems}>
                    {txs.map(tx => (
                      <TransactionItem
                        key={tx.id}
                        tx={tx}
                        category={categoryMap.get(tx.categoryId)}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 모바일 플로팅 버튼(FAB) */}
      <button className={styles.fab} onClick={handleAdd} type="button" aria-label="거래 추가">
        <IcPlus size={24} />
      </button>

      {/* BottomSheet 거래 작성 폼 */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditing(undefined); }}
        title={editing ? '거래 수정' : '거래 추가'}
      >
        <TransactionForm
          initial={editing}
          ym={activeMonth}
          minDate={toLocalDateStr(periodStart)}
          maxDate={toLocalDateStr(periodEnd)}
          categories={config.categories}
          paymentMethods={config.paymentMethods}
          counterparties={config.counterparties}
          accounts={accounts}
          onSave={handleSave}
          onDelete={editing ? handleDelete : undefined}
        />
      </BottomSheet>
    </div>
  );
}
