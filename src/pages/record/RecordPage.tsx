// RecordPage — Design System V2
// 320px sidebar + main transaction list

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { TransactionForm } from './TransactionForm';
import { TransactionItem } from './TransactionItem';
import { useDriveSync } from '../../hooks/useDriveSync';
import {
  IcChevronLeft, IcChevronRight, IcPlus, IcSearch, IcFilter,
} from '../../components/ui/Icons';
import type { Transaction, SharedExpense } from '../../domain/types';
import styles from './RecordPage.module.css';

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

// Progress bar
function ProgressBar({ value, max = 100, color = 'var(--mint-500)', height = 4 }: {
  value: number; max?: number; color?: string; height?: number;
}) {
  const p = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div style={{ height, background: 'var(--bg-3)', borderRadius: height/2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: height/2, transition: 'width 0.5s ease' }}/>
    </div>
  );
}

// ─── RecordPage ───────────────────────────────────────────────────────────────

export function RecordPage() {
  const activeMonth    = useAppStore(s => s.activeMonth);
  const setActiveMonth = useAppStore(s => s.setActiveMonth);
  const config         = useAppStore(s => s.config);

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
    localCache.getTransactions(activeMonth).then(setTransactions).finally(() => setLoading(false));
  }, [activeMonth]);

  const handleSave = useCallback(async (tx: Transaction, counterpartyId?: string) => {
    if (tx.isShared && counterpartyId && !tx.sharedExpenseId) {
      const now = new Date().toISOString();
      const myShare = Math.round(tx.amount / 2);
      const expense: SharedExpense = {
        id: `se_${crypto.randomUUID()}`, transactionId: tx.id,
        counterpartyId, paidBy: 'me', splitMode: 'equal',
        myShareAmount: myShare, counterpartyShareAmount: tx.amount - myShare,
        settledInAmount: 0, settledOutAmount: 0, status: 'open', createdAt: now, updatedAt: now,
      };
      tx = { ...tx, sharedExpenseId: expense.id };
      await localCache.upsertSharedExpense(activeMonth, expense);
      scheduleDrive(async () => {
        const updated = await localCache.getSharedExpenses(activeMonth);
        await driveAdapter.writeSharedExpenses(activeMonth, makeEnvelope(`shared/${activeMonth}.shared-expenses.json`, updated));
      });
    }
    await localCache.upsertTransaction(activeMonth, tx);
    setTransactions(await localCache.getTransactions(activeMonth));
    setSheetOpen(false);
    setEditing(undefined);
    scheduleDrive(async () => {
      const latest = await localCache.getTransactions(activeMonth);
      await driveAdapter.writeTransactions(activeMonth, makeEnvelope(`months/${activeMonth}.transactions.json`, latest));
    });
  }, [activeMonth, scheduleDrive]);

  const handleDelete = useCallback(async (id: string) => {
    await localCache.deleteTransaction(activeMonth, id);
    setTransactions(await localCache.getTransactions(activeMonth));
    setSheetOpen(false);
    setEditing(undefined);
    scheduleDrive(async () => {
      const latest = await localCache.getTransactions(activeMonth);
      await driveAdapter.writeTransactions(activeMonth, makeEnvelope(`months/${activeMonth}.transactions.json`, latest));
    });
  }, [activeMonth, scheduleDrive]);

  const handleEdit = (tx: Transaction) => { setEditing(tx); setSheetOpen(true); };
  const handleAdd  = () => { setEditing(undefined); setSheetOpen(true); };

  // ─ Summary ───────────────────────────────────────────────────────────────────
  const totalIncome  = transactions.filter(t => t.entryKind === 'income').reduce((s,t) => s+t.amount, 0);
  const totalExpense = transactions.filter(t => t.entryKind === 'expense').reduce((s,t) => s+t.amount, 0);
  const net          = totalIncome - totalExpense;

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
      .sort((a,b) => b.total - a.total)
      .slice(0, 6),
    [catExpenseMap, categoryMap],
  );

  const filtered = useMemo(() => {
    let list = transactions;
    if (filterKind !== 'all') list = list.filter(t => t.entryKind === filterKind);
    if (filterCategoryId) list = list.filter(t => t.categoryId === filterCategoryId);
    return list;
  }, [transactions, filterKind, filterCategoryId]);

  const grouped = groupByDate(filtered);

  const [y, mo]  = activeMonth.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const today    = new Date();
  const elapsed  = (today.getFullYear() === y && today.getMonth() + 1 === mo)
    ? today.getDate() : daysInMonth;
  const dailyAvg = elapsed > 0 ? Math.round(totalExpense / elapsed) : 0;


  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.subtitle}>TRANSACTIONS</div>
          <div className={styles.title}>기록</div>
        </div>
        <div className={styles.monthNav}>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(prevYM(activeMonth))} type="button"><IcChevronLeft size={16}/></button>
          <span className={styles.monthLabel}>{activeMonth.replace('-','.')}</span>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(nextYM(activeMonth))} type="button"><IcChevronRight size={16}/></button>
        </div>
        <div className={styles.topStats}>
          <div className={styles.topStat}>
            <div className={styles.topStatLabel}>수입</div>
            <div className={styles.topStatVal} style={{ color: 'var(--mint-300)' }}>+{fmt(totalIncome)}</div>
          </div>
          <div className={styles.topStat}>
            <div className={styles.topStatLabel}>지출</div>
            <div className={styles.topStatVal} style={{ color: 'var(--danger)' }}>−{fmt(totalExpense)}</div>
          </div>
          <div className={styles.topStat}>
            <div className={styles.topStatLabel}>순잔액</div>
            <div className={styles.topStatVal} style={{ color: net >= 0 ? 'var(--mint-300)' : 'var(--danger)' }}>
              {fmtSigned(net)}
            </div>
          </div>
          <div className={styles.topStat}>
            <div className={styles.topStatLabel}>거래</div>
            <div className={styles.topStatVal}>{transactions.length}건</div>
          </div>
        </div>
        <button className={styles.addBtn} onClick={handleAdd} type="button">
          <IcPlus size={16}/> 거래 추가
        </button>
      </div>

      {/* ── Main grid ── */}
      <div className={styles.mainGrid}>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {/* Category expenses */}
          <div className={styles.sideLabel}>카테고리별 지출</div>
          {topCategories.length === 0 ? (
            <p className={styles.sideEmpty}>지출 내역 없음</p>
          ) : (
            <div className={styles.catList}>
              {topCategories.map(({ catId, total, cat }) => {
                const pct = totalExpense > 0 ? (total / totalExpense) * 100 : 0;
                const isActive = filterCategoryId === catId;
                const color = catColor(catId, cat?.colorToken);
                return (
                  <div key={catId} className={`${styles.catItem} ${isActive ? styles.catItemActive : ''}`}
                    onClick={() => setFilterCat(isActive ? '' : catId)} role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setFilterCat(isActive ? '' : catId)}>
                    <div className={styles.catChip} style={{ background: `${color}22`, color }}>
                      <span style={{ fontSize: 11 }}>{cat?.icon ?? '●'}</span>
                    </div>
                    <div className={styles.catInfo}>
                      <div className={styles.catRow}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{cat?.name ?? '미분류'}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{fmt(total)}</span>
                      </div>
                      <ProgressBar value={pct} max={25} color={color} height={4}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Monthly stats */}
          <div className={styles.monthStats}>
            <div className={styles.sideLabel}>이달 통계</div>
            <div className={styles.statsGrid}>
              <div className={styles.statCell}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>총 거래</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>
                  {transactions.length}<span style={{ fontSize: 11, color: 'var(--text-2)' }}>건</span>
                </div>
              </div>
              <div className={styles.statCell}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>지출 건</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>
                  {transactions.filter(t=>t.entryKind==='expense').length}<span style={{ fontSize: 11, color: 'var(--text-2)' }}>건</span>
                </div>
              </div>
              <div className={styles.statCell}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>수입 건</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>
                  {transactions.filter(t=>t.entryKind==='income').length}<span style={{ fontSize: 11, color: 'var(--text-2)' }}>건</span>
                </div>
              </div>
              <div className={styles.statCell}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>일 평균</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>
                  {fmt(dailyAvg)}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main list */}
        <div className={styles.listArea}>
          {/* Filter + search bar */}
          <div className={styles.listToolbar}>
            <div className={styles.tabs}>
              {([['all','전체'],['expense','지출'],['income','수입']] as const).map(([id, label]) => (
                <button key={id} className={`${styles.tab} ${filterKind === id ? styles.tabActive : ''}`}
                  onClick={() => setFilterKind(id)} type="button">{label}</button>
              ))}
            </div>
            <div style={{ flex: 1 }}/>
            <button className={styles.iconBtn} type="button"><IcSearch size={16}/></button>
            <button className={styles.iconBtn} type="button"><IcFilter size={16}/></button>
          </div>

          {/* Group by date */}
          {loading ? (
            <div className={styles.emptyState}>
              <p style={{ color: 'var(--text-2)' }}>불러오는 중...</p>
            </div>
          ) : grouped.size === 0 ? (
            <div className={styles.emptyState}>
              <p style={{ color: 'var(--text-2)', marginBottom: 12 }}>거래 내역이 없습니다</p>
              <button className={styles.addBtnSm} onClick={handleAdd} type="button">
                <IcPlus size={14}/> 첫 거래 기록하기
              </button>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([date, txs]) => {
              const dayTotal = txs.reduce((s,t) => s + (t.entryKind === 'income' ? t.amount : -t.amount), 0);
              return (
                <div key={date} className={styles.dateGroup}>
                  <div className={styles.dateHeader}>
                    <span className={styles.dateLabel}>{formatDate(date)}</span>
                    <div style={{ flex: 1, height: 1 }}/>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                      color: dayTotal > 0 ? 'var(--mint-300)' : 'var(--text-2)',
                    }}>{fmtSigned(dayTotal)}</span>
                  </div>
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
              );
            })
          )}
        </div>
      </div>

      {/* ── BottomSheet ── */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditing(undefined); }}
        title={editing ? '거래 수정' : '거래 추가'}
      >
        <TransactionForm
          initial={editing}
          ym={activeMonth}
          categories={config.categories}
          paymentMethods={config.paymentMethods}
          counterparties={config.counterparties}
          onSave={handleSave}
          onDelete={editing ? handleDelete : undefined}
        />
      </BottomSheet>

      {/* Mobile FAB */}
      <button className={styles.fab} onClick={handleAdd} type="button" aria-label="거래 추가">
        <IcPlus size={22}/>
      </button>
    </div>
  );
}
