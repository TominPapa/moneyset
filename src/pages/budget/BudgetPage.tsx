// BudgetPage — Design System V2
// Ring gauge hero + category grid + required expenses

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { buildSafetyInput } from '../../domain/safetyUtils';
import { calcSafetySummary } from '../../domain/safety';
import { getBudgetPlan, saveBudgetPlan } from '../../storage/localPlanStore';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import { IcChevronLeft, IcChevronRight, IcBudget, IcArrowLeft } from '../../components/ui/Icons';
import type { Transaction, BudgetPlan, BudgetItem } from '../../domain/types';
import styles from './BudgetPage.module.css';

// ─── utils ────────────────────────────────────────────────────────────────────

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

// ─── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max = 100, color = 'var(--mint-500)', height = 4 }: {
  value: number; max?: number; color?: string; height?: number;
}) {
  const p = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div style={{ height, background: 'var(--bg-3)', borderRadius: height/2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: height/2, transition: 'width 0.6s ease' }}/>
    </div>
  );
}

// ─── BudgetPage ───────────────────────────────────────────────────────────────

export function BudgetPage() {
  const activeMonth    = useAppStore((s) => s.activeMonth);
  const setActiveMonth = useAppStore((s) => s.setActiveMonth);
  const config         = useAppStore((s) => s.config);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [plan, setPlan]                 = useState<BudgetPlan | null>(null);
  const [monthlyBudgetBase, setMonthlyBudgetBase] = useState(0);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editTotal, setEditTotal]         = useState(0);
  const [editItems, setEditItems]         = useState<BudgetItem[]>([]);
  const [activeTab, setActiveTab]         = useState<'all' | 'over' | 'ok'>('all');

  const load = useCallback(async () => {
    const txs = await localCache.getTransactions(activeMonth);
    setTransactions(txs);
    const input = buildSafetyInput(txs, config, new Date());
    const summary = calcSafetySummary(input);
    setMonthlyBudgetBase(summary.monthlyBudgetBase);
    const existing = getBudgetPlan(activeMonth);
    setPlan(existing);
  }, [activeMonth, config]);

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
  const elapsed = (today.getFullYear() === y && today.getMonth() + 1 === mo)
    ? today.getDate() : new Date(y, mo, 0).getDate();
  const dailyAvg    = elapsed > 0 ? Math.round(totalSpent / elapsed) : 0;
  const dailyBudget = new Date(y, mo, 0).getDate() > 0
    ? Math.round(totalBudget / new Date(y, mo, 0).getDate()) : 0;

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
    // localStorage 저장 (즉시, 동기)
    saveBudgetPlan(newPlan);
    setPlan(newPlan);
    setEditSheetOpen(false);
    // Drive 동기화 (best-effort, 실패해도 UI 영향 없음)
    try {
      const envelope = {
        schemaVersion: '1.0',
        fileType: 'budget-plan',
        updatedAt: now,
        revisionHint: crypto.randomUUID(),
        data: newPlan,
      };
      await driveAdapter.writeBudgetPlan(activeMonth, envelope);
    } catch { /* Drive 미연결 또는 오류 — 로컬 저장은 완료됨 */ }
  }

  function copyFromLastMonth() {
    const prev = getBudgetPlan(prevYM(activeMonth));
    if (!prev) return;
    const now = new Date().toISOString();
    const copied: BudgetPlan = { ...prev, id: `bp_${crypto.randomUUID()}`, targetMonth: activeMonth, createdAt: now, updatedAt: now };
    saveBudgetPlan(copied);
    setPlan(copied);
  }

  // Ring gauge
  const ringColor = barColor(totalPct);
  const R = 86; const stroke = 14;
  const C = 2 * Math.PI * R;
  const ringOff = C * (1 - totalPct / 100);

  // Category cards filtered by tab
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

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.subtitle}>BUDGETING</div>
          <div className={styles.title}>예산</div>
        </div>
        <div className={styles.monthNav}>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(prevYM(activeMonth))} type="button"><IcChevronLeft size={16}/></button>
          <span className={styles.monthLabel}>{activeMonth.replace('-', '.')}</span>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(nextYM(activeMonth))} type="button"><IcChevronRight size={16}/></button>
        </div>
        <div className={styles.topActions}>
          <button className={styles.actionBtn} onClick={copyFromLastMonth} type="button">
            <IcArrowLeft size={14}/> 지난달 복사
          </button>
          <button className={styles.actionBtnPrimary} onClick={openEdit} type="button">
            <IcBudget size={14}/> 예산 설정
          </button>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className={styles.scroll}>
        <div className={styles.mainGrid}>

          {/* Left: Ring gauge */}
          <div className={styles.gaugeCard}>
            <div className={styles.gaugeLabel}>이번 달 생활비 예산</div>
            <div className={styles.ringWrap}>
              <svg width={200} height={200}>
                <circle cx={100} cy={100} r={R} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,0.06)"/>
                <circle cx={100} cy={100} r={R} fill="none" strokeWidth={stroke}
                  stroke={ringColor} strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={ringOff}
                  transform="rotate(-90 100 100)"
                  style={{ filter: `drop-shadow(0 0 10px ${ringColor}60)`, transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div className={styles.ringInner}>
                <div className={styles.ringPct} style={{ color: ringColor }}>
                  {totalPct}<span style={{ fontSize: 22 }}>%</span>
                </div>
                <div className={styles.ringSubLabel} style={{ color: isOver ? 'var(--danger)' : 'var(--text-2)' }}>
                  {isOver ? '초과 구간' : '사용'}
                </div>
              </div>
            </div>

            <div className={styles.amountGrid}>
              <div className={styles.amountItem}>
                <div className={styles.amountLabel}>지출</div>
                <div className={styles.amountValue}>{fmt(totalSpent)}</div>
              </div>
              <div className={styles.amountItem}>
                <div className={styles.amountLabel}>예산</div>
                <div className={styles.amountValue}>{fmt(totalBudget)}</div>
              </div>
              {isOver ? (
                <div className={styles.amountItemOver}>
                  <div className={styles.amountLabel} style={{ color: 'var(--danger)' }}>초과</div>
                  <div className={styles.amountValue} style={{ color: 'var(--danger)' }}>-{fmt(overAmount)}</div>
                </div>
              ) : (
                <div className={styles.amountItem}>
                  <div className={styles.amountLabel}>남은 예산</div>
                  <div className={styles.amountValue} style={{ color: 'var(--mint-300)' }}>{fmt(remaining)}</div>
                </div>
              )}
            </div>

            <div className={styles.dailyStats}>
              <div className={styles.dailyItem}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>일 평균 지출</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmt(dailyAvg)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>최근 {elapsed}일 기준</div>
              </div>
              <div className={styles.dailyItem}>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>일 예산</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmt(dailyBudget)}</div>
                <div style={{ fontSize: 10, color: dailyAvg > dailyBudget ? 'var(--gold-300)' : 'var(--mint-300)' }}>
                  {dailyAvg > dailyBudget ? '초과 ▲' : '정상 ✓'}
                </div>
              </div>
            </div>

            {plan === null && (
              <div className={styles.noPlanHint}>
                안전도 기준 예산 ({fmt(monthlyBudgetBase)}) 표시 중
              </div>
            )}
          </div>

          {/* Right: Category grid */}
          <div className={styles.catSection}>
            <div className={styles.catHeader}>
              <div>
                <div className={styles.subtitle}>카테고리별 예산</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                  {livingCategories.length}개 카테고리 · {overCount}개 초과
                </div>
              </div>
              {/* Tab filter */}
              <div className={styles.tabs}>
                {(['all', 'over', 'ok'] as const).map(t => (
                  <button key={t} className={`${styles.tab} ${activeTab === t ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab(t)} type="button">
                    {t === 'all' ? '전체' : t === 'over' ? '초과' : '정상'}
                  </button>
                ))}
              </div>
            </div>

            {livingCategories.length === 0 ? (
              <p className={styles.empty}>생활비 카테고리가 없습니다.</p>
            ) : (
              <div className={styles.catGrid}>
                {catCards.map(({ cat, spent, budget, p, over }) => {
                  const color = over ? 'var(--danger)' : catColor(cat.id, cat.colorToken);
                  return (
                    <div key={cat.id} className={`${styles.catCard} ${over ? styles.catCardOver : ''}`}>
                      <div className={styles.catCardHeader}>
                        <div className={styles.catChip} style={{ background: `${catColor(cat.id, cat.colorToken)}22`, color: catColor(cat.id, cat.colorToken) }}>
                          <span style={{ fontSize: 13 }}>{cat.icon ?? '●'}</span>
                        </div>
                        <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{cat.name}</div>
                        {over && <span className={styles.overBadge}>초과</span>}
                      </div>
                      <div className={styles.catPctRow}>
                        <span className={styles.catPctBig} style={{ color }}>
                          {budget > 0 ? p : '—'}<span style={{ fontSize: 12 }}>{budget > 0 ? '%' : ''}</span>
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          {budget > 0 ? `${fmt(spent)} / ${fmt(budget)}` : fmt(spent)}
                        </span>
                      </div>
                      {budget > 0 && <ProgressBar value={Math.min(p, 100)} max={100} color={color} height={4}/>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Required expenses */}
        {requiredTxs.length > 0 && (
          <div className={styles.reqCard}>
            <div className={styles.reqHeader}>
              <div>
                <div className={styles.subtitle}>이번 달 필수지출</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>고정지출 · 자동이체 · 할부</div>
              </div>
              <span className={styles.goldPill}>합계 {fmt(requiredTxs.reduce((s,t)=>s+t.amount,0))}</span>
            </div>
            <div className={styles.reqGrid}>
              {requiredTxs.map(tx => {
                const cat = requiredCategoryMap.get(tx.categoryId);
                return (
                  <div key={tx.id} className={styles.reqItem}>
                    <div className={styles.reqIcon} style={{ background: `${catColor(tx.categoryId, cat?.colorToken)}22`, color: catColor(tx.categoryId, cat?.colorToken) }}>
                      <span style={{ fontSize: 12 }}>{cat?.icon ?? '●'}</span>
                    </div>
                    <div className={styles.reqInfo}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{cat?.name ?? '필수지출'}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600 }}>{fmt(tx.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit BottomSheet */}
      <BottomSheet open={editSheetOpen} onClose={() => setEditSheetOpen(false)} title="예산 설정">
        <div className={styles.editForm}>
          <div className={styles.editField}>
            <label className={styles.editLabel}>총 생활비 예산</label>
            <AmountInput value={editTotal} onChange={setEditTotal} placeholder="0" />
            <p className={styles.editHint}>안전도 기준 예산: {fmt(monthlyBudgetBase)}</p>
          </div>
          <h3 className={styles.editSectionTitle}>카테고리별 예산 (선택)</h3>
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
              </div>
            );
          })}
          <div className={styles.editActions}>
            <Button variant="primary" onClick={savePlan}>저장</Button>
            <Button variant="ghost" onClick={() => setEditSheetOpen(false)}>취소</Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
