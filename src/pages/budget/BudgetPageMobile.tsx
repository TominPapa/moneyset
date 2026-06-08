// BudgetPageMobile — 모바일 전용 예산 설정 화면
// 직관적인 가로형 프로그레스 요약, 1열 카테고리 카드 리스트, 아코디언식 접기/펼치기, 예산 퀵 증감 버튼 (+1만 / +5만 등)

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { buildSafetyInput } from '../../domain/safetyUtils';
import { calcSafetySummary } from '../../domain/safety';
import { getBudgetPlan, saveBudgetPlan, hasPendingSync } from '../../storage/localPlanStore';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import {
  IcChevronLeft, IcChevronRight, IcBudget, IcArrowLeft
} from '../../components/ui/Icons';
import type { Transaction, BudgetPlan, BudgetItem } from '../../domain/types';
import styles from './BudgetPageMobile.module.css';

function fmt(n: number): string { return n.toLocaleString('ko-KR') + '원'; }
function pct(spent: number, budget: number): number {
  if (budget <= 0) return spent > 0 ? 100 : 0;
  return Math.min(200, Math.round((spent / budget) * 100));
}
function barColor(p: number): string {
  if (p >= 100) return 'var(--danger)';
  if (p >=  90) return 'var(--safe-4)';
  if (p >=  70) return 'var(--safe-3)';
  return 'var(--mint-500)';
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

function ProgressBar({ value, max = 100, color = 'var(--mint-500)', height = 6 }: {
  value: number; max?: number; color?: string; height?: number;
}) {
  const p = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div style={{ height, background: 'var(--bg-3)', borderRadius: height/2, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: height/2, transition: 'width 0.6s ease' }}/>
    </div>
  );
}

export function BudgetPageMobile() {
  const activeMonth    = useAppStore((s) => s.activeMonth);
  const setActiveMonth = useAppStore((s) => s.setActiveMonth);
  const config         = useAppStore((s) => s.config);
  const lastSyncedAt   = useAppStore((s) => s.lastSyncedAt);
  const accounts       = useAppStore((s) => s.accounts);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [plan, setPlan]                 = useState<BudgetPlan | null>(null);
  const [monthlyBudgetBase, setMonthlyBudgetBase] = useState(0);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editTotal, setEditTotal]         = useState(0);
  const [editItems, setEditItems]         = useState<BudgetItem[]>([]);
  const [activeTab, setActiveTab]         = useState<'all' | 'over' | 'ok'>('all');
  const [isPending, setIsPending]         = useState(false);

  // 아코디언 상태: true = 펼침, false = 접힘
  const [livingOpen, setLivingOpen] = useState(true);
  const [requiredOpen, setRequiredOpen] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsPending(hasPendingSync());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    const txs = await localCache.getTransactions(activeMonth);
    setTransactions(txs);
    const input = buildSafetyInput(txs, config, new Date(), undefined, accounts);
    const summary = calcSafetySummary(input);
    setMonthlyBudgetBase(summary.monthlyBudgetBase);
    const existing = await getBudgetPlan(activeMonth);
    setPlan(existing);
  }, [activeMonth, config, accounts, lastSyncedAt]);

  useEffect(() => { void load(); }, [load]);

  const livingCategories = config.categories.filter(
    c => c.entryKind === 'expense' && c.budgetGroup === 'living',
  );

  const spentByCategory = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.entryKind !== 'expense') continue;
    const cat = config.categories.find(c => c.id === tx.categoryId);
    if (!cat || cat.budgetGroup !== 'living') continue;
    spentByCategory.set(tx.categoryId, (spentByCategory.get(tx.categoryId) ?? 0) + tx.amount);
  }

  const requiredCategoryMap = new Map(
    config.categories.filter(c => c.entryKind === 'expense' && c.budgetGroup === 'required').map(c => [c.id, c]),
  );
  const requiredTxs = transactions
    .filter(tx => tx.entryKind === 'expense' && requiredCategoryMap.has(tx.categoryId))
    .sort((a,b) => b.amount - a.amount);

  const totalSpent  = Array.from(spentByCategory.values()).reduce((s,v) => s+v, 0);
  const totalBudget = plan?.totalBudgetAmount ?? monthlyBudgetBase;
  const totalPct    = Math.min(100, pct(totalSpent, totalBudget));
  const remaining   = Math.max(0, totalBudget - totalSpent);
  const overAmount  = Math.max(0, totalSpent - totalBudget);
  const isOver      = totalSpent > totalBudget;

  const [y, mo] = activeMonth.split('-').map(Number);
  const today = new Date();
  const isCurrMonth  = today.getFullYear() === y && today.getMonth() + 1 === mo;
  const isFutureMonth = new Date(y, mo - 1, 1) > today;
  const daysInMo     = new Date(y, mo, 0).getDate();
  const elapsed = isCurrMonth ? today.getDate() : isFutureMonth ? 0 : daysInMo;
  const dailyAvg    = elapsed > 0 ? Math.round(totalSpent / elapsed) : 0;
  const dailyBudget = daysInMo > 0 ? Math.round(totalBudget / daysInMo) : 0;

  function openEdit() {
    setEditTotal(plan?.totalBudgetAmount ?? monthlyBudgetBase);
    const existing = plan?.items ?? [];
    const items: BudgetItem[] = livingCategories.map(cat => {
      const found = existing.find(i => i.categoryId === cat.id);
      return found ?? { id: crypto.randomUUID(), categoryId: cat.id, budgetAmount: 0 };
    });
    setEditItems(items);
    setEditSheetOpen(true);
  }

  async function savePlan() {
    const now = new Date().toISOString();
    const newPlan: BudgetPlan = {
      id: plan?.id ?? `bp_${crypto.randomUUID()}`,
      targetMonth: activeMonth,
      totalBudgetAmount: editTotal,
      items: editItems.filter(i => i.budgetAmount > 0),
      createdAt: plan?.createdAt ?? now,
      updatedAt: now,
    };
    await saveBudgetPlan(newPlan);
    setPlan(newPlan);
    setEditSheetOpen(false);
  }

  async function copyFromLastMonth() {
    const prev = await getBudgetPlan(prevYM(activeMonth));
    if (!prev) return;
    const now = new Date().toISOString();
    const copied: BudgetPlan = { ...prev, id: `bp_${crypto.randomUUID()}`, targetMonth: activeMonth, createdAt: now, updatedAt: now };
    await saveBudgetPlan(copied);
    setPlan(copied);
  }

  const catCards = livingCategories.map(cat => {
    const spent  = spentByCategory.get(cat.id) ?? 0;
    const budget = plan?.items.find(i => i.categoryId === cat.id)?.budgetAmount ?? 0;
    const p      = budget > 0 ? pct(spent, budget) : 0;
    const over   = budget > 0 && p >= 100;
    return { cat, spent, budget, p, over };
  }).filter(r => {
    if (activeTab === 'over') return r.over;
    if (activeTab === 'ok')   return !r.over && r.budget > 0;
    return true;
  });

  const overCount = livingCategories.filter(cat => {
    const s = spentByCategory.get(cat.id) ?? 0;
    const b = plan?.items.find(i => i.categoryId === cat.id)?.budgetAmount ?? 0;
    return b > 0 && s >= b;
  }).length;

  const quickAmounts = [
    { label: '+1만', value: 10000 },
    { label: '+5만', value: 50000 },
    { label: '+10만', value: 100000 },
    { label: '-1만', value: -10000 },
  ];

  return (
    <div className={styles.page}>
      {/* 상단 바 */}
      <header className={styles.header}>
        <div className={styles.headerTitleRow}>
          <span className={styles.pageTitle}>예산</span>
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
        <div className={styles.progressHeader}>
          <span className={styles.progressLabel}>생활비 예산 사용</span>
          <span className={styles.progressPct} style={{ color: barColor(totalPct) }}>{totalPct}%</span>
        </div>
        <ProgressBar value={totalPct} max={100} color={barColor(totalPct)} height={8} />

        <div className={styles.amountGrid}>
          <div className={styles.amountItem}>
            <span className={styles.amountLabel}>지출</span>
            <span className={styles.amountVal}>{fmt(totalSpent)}</span>
          </div>
          <div className={styles.amountItem}>
            <span className={styles.amountLabel}>예산</span>
            <span className={styles.amountVal}>{fmt(totalBudget)}</span>
          </div>
          <div className={styles.amountItem}>
            {isOver ? (
              <>
                <span className={styles.amountLabel} style={{ color: 'var(--danger)' }}>초과</span>
                <span className={styles.amountVal} style={{ color: 'var(--danger)' }}>-{fmt(overAmount)}</span>
              </>
            ) : (
              <>
                <span className={styles.amountLabel}>남은 예산</span>
                <span className={styles.amountVal} style={{ color: 'var(--mint-400)' }}>{fmt(remaining)}</span>
              </>
            )}
          </div>
        </div>

        <div className={styles.dailyGrid}>
          <div className={styles.dailyItem}>
            <span className={styles.dailyLabel}>일 평균 지출 ({elapsed}일 기준)</span>
            <span className={styles.dailyVal}>{fmt(dailyAvg)}</span>
          </div>
          <div className={styles.dailyDivider} />
          <div className={styles.dailyItem}>
            <span className={styles.dailyLabel}>권장 하루 예산 ({daysInMo}일 기준)</span>
            <span className={styles.dailyVal}>{fmt(dailyBudget)}</span>
          </div>
        </div>

        {plan === null && (
          <div className={styles.noPlanHint}>
            💡 안전도 권장 예산 ({fmt(monthlyBudgetBase)}) 표시 중
          </div>
        )}
      </section>

      {/* 퀵 액션 */}
      <section className={styles.quickActions}>
        <button className={styles.actionBtn} onClick={copyFromLastMonth} type="button">
          <IcArrowLeft size={12}/> 지난달 복사
        </button>
        <button className={styles.actionBtnPrimary} onClick={openEdit} type="button">
          <IcBudget size={12}/> 예산 설정
        </button>
      </section>

      {/* 아코디언 1: 생활비 예산 */}
      <section className={styles.accordionSection}>
        <button
          className={styles.accordionHeader}
          onClick={() => setLivingOpen(!livingOpen)}
          type="button"
        >
          <div className={styles.accordionTitleCol}>
            <span className={styles.accordionTitle}>생활비 카테고리 예산</span>
            <span className={styles.accordionSubtitle}>
              {livingCategories.length}개 항목 · {overCount}개 초과
            </span>
          </div>
          <span className={styles.accordionArrow}>{livingOpen ? '▼' : '▶'}</span>
        </button>

        {livingOpen && (
          <div className={styles.accordionContent}>
            {/* 탭 필터 */}
            <div className={styles.tabs}>
              {(['all', 'over', 'ok'] as const).map(t => (
                <button
                  key={t}
                  className={`${styles.tab} ${activeTab === t ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(t)}
                  type="button"
                >
                  {t === 'all' ? '전체' : t === 'over' ? '초과' : '정상'}
                </button>
              ))}
            </div>

            {livingCategories.length === 0 ? (
              <p className={styles.empty}>생활비 카테고리가 없습니다.</p>
            ) : (
              <div className={styles.catList}>
                {catCards.map(({ cat, spent, budget, p, over }) => {
                  const color = over ? 'var(--danger)' : catColor(cat.id, cat.colorToken);
                  return (
                    <div key={cat.id} className={`${styles.catCard} ${over ? styles.catCardOver : ''}`}>
                      <div className={styles.catCardTop}>
                        <div className={styles.catIconWrapper} style={{ background: `${catColor(cat.id, cat.colorToken)}22`, color: catColor(cat.id, cat.colorToken) }}>
                          {cat.icon ?? '●'}
                        </div>
                        <div className={styles.catInfo}>
                          <span className={styles.catName}>{cat.name}</span>
                          <span className={styles.catAmtDetail}>
                            {budget > 0 ? `${fmt(spent)} / ${fmt(budget)}` : fmt(spent)}
                          </span>
                        </div>
                        <div className={styles.catPctWrapper}>
                          <span className={styles.catPctBig} style={{ color }}>
                            {budget > 0 ? `${p}%` : '—'}
                          </span>
                          {over && <span className={styles.overBadge}>초과</span>}
                        </div>
                      </div>
                      {budget > 0 && (
                        <div className={styles.catProgress}>
                          <ProgressBar value={Math.min(p, 100)} max={100} color={color} height={4} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 아코디언 2: 필수 지출 */}
      {requiredTxs.length > 0 && (
        <section className={styles.accordionSection}>
          <button
            className={styles.accordionHeader}
            onClick={() => setRequiredOpen(!requiredOpen)}
            type="button"
          >
            <div className={styles.accordionTitleCol}>
              <span className={styles.accordionTitle}>이번 달 필수 지출</span>
              <span className={styles.accordionSubtitle}>고정비 · 이체 · 할부 등</span>
            </div>
            <div className={styles.accordionArrowRow}>
              <span className={styles.goldPill}>합계 {fmt(requiredTxs.reduce((s,t)=>s+t.amount,0))}</span>
              <span className={styles.accordionArrow}>{requiredOpen ? '▼' : '▶'}</span>
            </div>
          </button>

          {requiredOpen && (
            <div className={styles.accordionContent}>
              <div className={styles.reqList}>
                {requiredTxs.map(tx => {
                  const cat = requiredCategoryMap.get(tx.categoryId);
                  return (
                    <div key={tx.id} className={styles.reqItem}>
                      <div className={styles.reqIcon} style={{ background: `${catColor(tx.categoryId, cat?.colorToken)}22`, color: catColor(tx.categoryId, cat?.colorToken) }}>
                        {cat?.icon ?? '●'}
                      </div>
                      <div className={styles.reqInfo}>
                        <span className={styles.reqTitle}>{tx.title}</span>
                        <span className={styles.reqCatName}>{cat?.name ?? '필수지출'}</span>
                      </div>
                      <span className={styles.reqAmt}>{fmt(tx.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 동기화 진행 알림 */}
      {isPending && (
        <div className={styles.syncNotice}>
          ☁️ 클라우드 동기화 진행 중...
        </div>
      )}

      {/* 예산 설정 BottomSheet */}
      <BottomSheet open={editSheetOpen} onClose={() => setEditSheetOpen(false)} title="예산 설정">
        <div className={styles.editForm}>
          <div className={styles.editField}>
            <label className={styles.editLabel}>총 생활비 예산</label>
            <AmountInput value={editTotal} onChange={setEditTotal} placeholder="0" />
            
            {/* 퀵 증감 버튼 */}
            <div className={styles.quickAmountRow}>
              {quickAmounts.map(btn => (
                <button
                  key={btn.label}
                  type="button"
                  className={styles.quickAmtBtn}
                  onClick={() => setEditTotal(prev => Math.max(0, prev + btn.value))}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <p className={styles.editHint}>안전도 기준 예산: {fmt(monthlyBudgetBase)}</p>
          </div>
          
          <h3 className={styles.editSectionTitle}>카테고리별 예산 (선택)</h3>
          <div className={styles.editScrollArea}>
            {editItems.map((item, idx) => {
              const cat = livingCategories.find(c => c.id === item.categoryId);
              if (!cat) return null;
              return (
                <div key={item.categoryId} className={styles.editField}>
                  <label className={styles.editLabel}>{cat.icon} {cat.name}</label>
                  <AmountInput
                    value={item.budgetAmount}
                    onChange={v => {
                      const next = [...editItems];
                      next[idx] = { ...item, budgetAmount: v };
                      setEditItems(next);
                    }}
                    placeholder="0 (미설정)"
                  />
                  {/* 카테고리 개별 퀵 증감 */}
                  <div className={styles.quickAmountRow}>
                    {quickAmounts.map(btn => (
                      <button
                        key={btn.label}
                        type="button"
                        className={styles.quickAmtBtn}
                        onClick={() => {
                          const next = [...editItems];
                          next[idx] = { ...item, budgetAmount: Math.max(0, item.budgetAmount + btn.value) };
                          setEditItems(next);
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className={styles.editActions}>
            <Button variant="primary" onClick={savePlan}>저장</Button>
            <Button variant="ghost" onClick={() => setEditSheetOpen(false)}>취소</Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
