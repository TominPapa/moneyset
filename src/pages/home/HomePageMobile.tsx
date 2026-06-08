// HomePageMobile — RESET Budget Mobile Dedicated Dashboard
// Premium 1-column layout tailored for mobile screen size < 600px

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { calcSafetySummary } from '../../domain/safety';
import { buildSafetyInput, calcAssetSummary, getBudgetPeriodForMonth, getMonthsInPeriod } from '../../domain/safetyUtils';
import { detectReset } from '../../domain/reset';
import type { Transaction, SafetySummary, BudgetPlan } from '../../domain/types';
import { ROUTES } from '../../app/routes';
import { hasFeature } from '../../domain/tiers';
import { getBudgetPlan } from '../../storage/localPlanStore';
import {
  IcPlus, IcChevronLeft, IcChevronRight, IcArrowRight
} from '../../components/ui/Icons';
import styles from './HomePageMobile.module.css';

// ─── utils ────────────────────────────────────────────────────────────────────
function fmt(n: number): string { return n.toLocaleString('ko-KR') + '원'; }
function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return (n / 100_000_000).toFixed(1) + '억';
  if (abs >= 10_000)      return (n / 10_000).toFixed(0) + '만';
  return n.toLocaleString('ko-KR');
}
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function shortDate(s: string): string {
  const p = s.split('-');
  return `${Number(p[1])}/${Number(p[2])}`;
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

function safetyColor(level: string): string {
  const m: Record<string, string> = {
    very_safe: 'var(--safe-1)', safe: 'var(--safe-2)',
    warning: 'var(--safe-3)', risk: 'var(--safe-4)', critical: 'var(--safe-5)',
  };
  return m[level] ?? 'var(--text-2)';
}
function safetyLabel(level: string): string {
  const m: Record<string, string> = {
    very_safe: '매우 안전', safe: '안전', warning: '주의', risk: '위험', critical: '위기',
  };
  return m[level] ?? level;
}

const RESET_DISMISS_KEY = 'reset_banner_dismissed_date';

// ─── CATEGORY COLORS ──────────
const TOKEN_COLORS: Record<string, string> = {
  amber: '#F4A26B', brown: '#D4A876', coral: '#F08080', indigo: '#9DB6F0',
  blue: '#8AB6F0',  gray: '#8F8D85',  slate: '#8AB0C4', green: '#9DD19D',
  teal: '#7BC4D9',  purple: '#C9A6F0', red: '#F47272', yellow: '#F0D070',
  orange: '#F4A060', emerald: '#3FD6A4', lime: '#A8D96C',
};
function catColor(id: string, colorToken?: string): string {
  if (colorToken && TOKEN_COLORS[colorToken]) return TOKEN_COLORS[colorToken];
  const palette = ['#F4A26B','#8AB6F0','#D9B26A','#9DD19D','#C9A6F0'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length];
}

// ─── Micro progress bar ───
function ProgressBar({ value, max = 100, color = 'var(--mint-500)', height = 6 }: {
  value: number; max?: number; color?: string; height?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div className={styles.barTrack} style={{ height, borderRadius: height/2 }}>
      <div
        className={styles.barFill}
        style={{
          width: `${pct}%`,
          backgroundColor: color,
          borderRadius: height/2,
        }}
      />
    </div>
  );
}

export function HomePageMobile() {
  const config        = useAppStore((s) => s.config);
  const activeMonth   = useAppStore((s) => s.activeMonth);
  const setActiveMonth = useAppStore((s) => s.setActiveMonth);
  const userTier      = useAppStore((s) => s.userTier);
  const lastSyncedAt  = useAppStore((s) => s.lastSyncedAt);
  const accounts      = useAppStore((s) => s.accounts);
  const liabilities   = useAppStore((s) => s.liabilities);
  const navigate      = useNavigate();
  const isFree        = !hasFeature(userTier, 'record');

  const [transactions, setTransactions]       = useState<Transaction[]>([]);
  const [resetNeeded, setResetNeeded]         = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [budgetPlan, setBudgetPlan]           = useState<BudgetPlan | null>(null);

  useEffect(() => {
    const { start, end } = getBudgetPeriodForMonth(activeMonth, config);
    const months = getMonthsInPeriod(start, end);
    const startStr = toLocalDateStr(start);
    const endStr = toLocalDateStr(end);

    Promise.all([
      Promise.all(months.map(ym => localCache.getTransactions(ym))).then(results => {
        return results.flat().filter(t => t.date >= startStr && t.date <= endStr);
      }),
      getBudgetPlan(activeMonth),
    ]).then(([txs, plan]) => {
      setTransactions(txs);
      setBudgetPlan(plan);
    });
  }, [activeMonth, lastSyncedAt, config]);

  useEffect(() => {
    (async () => {
      const today = toLocalDateStr(new Date());
      const dismissedDate = localStorage.getItem(RESET_DISMISS_KEY);
      if (dismissedDate === today) { setBannerDismissed(true); return; }
      const [y, m] = activeMonth.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevYMStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
      const [txCur, txPrev, sessions] = await Promise.all([
        localCache.getTransactions(activeMonth),
        localCache.getTransactions(prevYMStr),
        localCache.getResetSessions(),
      ]);
      const allDates = [...txCur, ...txPrev].map((t) => t.date);
      const lastTxDate = allDates.length > 0 ? [...allDates].sort().reverse()[0] : undefined;
      const lastResetDate = sessions
        .filter((s) => s.completedAt)
        .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))[0]?.blankPeriodEnd;
      const result = detectReset({
        today, lastTransactionDate: lastTxDate,
        lastResetCompletedDate: lastResetDate,
        resetThresholdDays: config.resetThresholdDays,
      });
      setResetNeeded(result.resetNeeded);
    })();
  }, [activeMonth, config.resetThresholdDays, lastSyncedAt]);

  const handleDismissBanner = () => {
    localStorage.setItem(RESET_DISMISS_KEY, toLocalDateStr(new Date()));
    setBannerDismissed(true);
  };

  // Calculations
  const realToday = new Date();
  const { start: periodStart, end: periodEnd } = getBudgetPeriodForMonth(activeMonth, config);
  const virtualToday = realToday < periodStart ? periodStart : realToday;

  const safetyInput    = buildSafetyInput(transactions, config, virtualToday, budgetPlan?.totalBudgetAmount ?? undefined, accounts);
  const summary: SafetySummary = calcSafetySummary(safetyInput);
  const scoreNum       = Math.round(summary.safetyScore);
  const categoryMap    = new Map(config.categories.map((c) => [c.id, c]));

  const [year, month]  = activeMonth.split('-');
  const today          = new Date();
  const todayStr       = toLocalDateStr(today);
  const todayDay       = today.getDate();
  const [yl, ml]       = activeMonth.split('-').map(Number);
  const daysInMonth    = new Date(yl, ml, 0).getDate();
  const isCurrentMonth = today.getFullYear() === yl && today.getMonth() + 1 === ml;

  const totalIncome    = transactions.filter(t => t.entryKind === 'income').reduce((s,t) => s+t.amount, 0);
  const totalExpense   = transactions.filter(t => t.entryKind === 'expense').reduce((s,t) => s+t.amount, 0);

  const todayExpense   = transactions
    .filter(t => t.entryKind === 'expense' && t.date === todayStr)
    .reduce((s,t) => s+t.amount, 0);

  const dailyLimit     = Math.round(summary.dailyRecommendedLimit);
  const budgetBase     = summary.monthlyBudgetBase;

  const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const weekRanges = [
    { label: '1주차', startOffset: 0, endOffset: 6 },
    { label: '2주차', startOffset: 7, endOffset: 13 },
    { label: '3주차', startOffset: 14, endOffset: 20 },
    { label: '4주차', startOffset: 21, endOffset: totalDays - 1 },
  ];
  const weekBudgets = weekRanges.map(wk => {
    const days = wk.endOffset - wk.startOffset + 1;
    return budgetBase > 0 ? Math.round(budgetBase * days / totalDays) : 0;
  });
  function weekSpent(startOffset: number, endOffset: number): number {
    const dStart = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + startOffset);
    const dEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + endOffset);
    const fStr = toLocalDateStr(dStart);
    const tStr = toLocalDateStr(dEnd);
    return transactions.filter(t => {
      if (t.entryKind !== 'expense') return false;
      if (t.date < fStr || t.date > tStr) return false;
      return categoryMap.get(t.categoryId)?.budgetGroup === 'living';
    }).reduce((s,t) => s+t.amount, 0);
  }
  let curWeekIdx = -1;
  if (isCurrentMonth) {
    const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startZero = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
    const daysFromStart = Math.round((todayZero.getTime() - startZero.getTime()) / (1000 * 60 * 60 * 24));
    curWeekIdx = weekRanges.findIndex(wk => daysFromStart >= wk.startOffset && daysFromStart <= wk.endOffset);
  }

  // Recent transactions (mobile only shows 4)
  const recentTxs = [...transactions]
    .filter(tx => tx.date <= todayStr)
    .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);

  const effectiveIncomeForNet = totalIncome > 0 ? totalIncome : config.expectedNetIncomeDefault;
  const netBalance = effectiveIncomeForNet - totalExpense;
  const todayLimitPct = dailyLimit > 0 ? Math.min(100, Math.round((todayExpense / dailyLimit) * 100)) : 0;

  const savingsGoal = config.savingsTargetDefault ?? 0;
  const effectiveIncome = totalIncome > 0 ? totalIncome : config.expectedNetIncomeDefault;
  const currentSavings  = Math.max(0, effectiveIncome - totalExpense);
  const achievePct       = savingsGoal > 0 ? Math.min(100, Math.round((currentSavings / savingsGoal) * 100)) : 0;
  const elapsedDaysForSaving = isCurrentMonth ? todayDay : daysInMonth;
  const dailySavingRate  = elapsedDaysForSaving > 0 ? currentSavings / elapsedDaysForSaving : 0;
  const projected        = Math.round(dailySavingRate * daysInMonth);
  const isOnTrack        = savingsGoal <= 0 || projected >= savingsGoal;

  // Info message based on safety
  const safetyColorValue = safetyColor(summary.safetyLevel);
  const safetyLabelStr = safetyLabel(summary.safetyLevel);

  function getStatusDescription() {
    if (summary.monthlySpendableRemaining <= 0) return '이달 생활비 예산을 초과했습니다. 긴축 재정이 필요합니다.';
    if (summary.safetyLevel === 'very_safe') return '안정적인 소비 페이스입니다. 훌륭해요!';
    if (summary.safetyLevel === 'safe') return '계획 범위 내에서 원활하게 관리되고 있습니다.';
    if (summary.safetyLevel === 'warning') return '일일 권장 금액에 근접하고 있습니다. 지출을 잠시 조절해 보세요.';
    return '현재 지출 페이스가 위험 범위에 도달했습니다. 주의하세요.';
  }

  return (
    <div className={styles.container}>
      {/* ── Month Selector ── */}
      <div className={styles.monthSelector}>
        <button className={styles.monthBtn} onClick={() => setActiveMonth(prevYM(activeMonth))} type="button">
          <IcChevronLeft size={18} />
        </button>
        <span className={styles.monthText}>{year}년 {Number(month)}월</span>
        <button className={styles.monthBtn} onClick={() => setActiveMonth(nextYM(activeMonth))} type="button">
          <IcChevronRight size={18} />
        </button>
      </div>

      {/* ── Supporter Promo ── */}
      {isFree && (
        <div className={styles.promoCard} onClick={() => navigate(ROUTES.upgrade)}>
          <span className={styles.promoIcon}>🎁</span>
          <div className={styles.promoText}>
            <div className={styles.promoTitle}>서포터 혜택 사용 가능</div>
            <div className={styles.promoDesc}>가계부 모든 핵심 기능을 잠금 해제해 보세요</div>
          </div>
          <IcArrowRight size={14} style={{ color: 'var(--gold-400)' }} />
        </div>
      )}

      {/* ── Reset Banner ── */}
      {resetNeeded && !bannerDismissed && (
        <div className={styles.resetBanner}>
          <div className={styles.resetTextWrap}>
            <span className={styles.resetTitle}>기록 공백 발생</span>
            <span className={styles.resetDesc}>{config.resetThresholdDays}일째 미입력 중</span>
          </div>
          <div className={styles.resetActions}>
            <button className={styles.resetGoBtn} onClick={() => navigate(ROUTES.reset)} type="button">이동</button>
            <button className={styles.resetCloseBtn} onClick={handleDismissBanner} type="button">✕</button>
          </div>
        </div>
      )}

      {/* ── Asset Summary Row ── */}
      {(() => {
        const as = calcAssetSummary(accounts, liabilities);
        return (
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>총 자산</span>
              <span className={styles.summaryValue} style={{ color: 'var(--mint-500)' }}>{fmt(as.totalAssets)}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>총 부채</span>
              <span className={styles.summaryValue} style={{ color: 'var(--danger)' }}>{fmt(as.totalLiabilities)}</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>순자산</span>
              <span className={styles.summaryValue} style={{ color: as.netWorth >= 0 ? 'var(--text-0)' : 'var(--danger)' }}>{fmt(as.netWorth)}</span>
            </div>
          </div>
        );
      })()}

      {/* ── Card 1: Core Remaining Budget ── */}
      <section className={styles.card} onClick={() => navigate(ROUTES.safety)}>
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>남은 생활비</span>
          <div className={styles.scoreBadge} style={{ borderColor: safetyColorValue, color: safetyColorValue }}>
            {scoreNum}점 · {safetyLabelStr}
          </div>
        </div>
        <div className={styles.remainingVal}>
          {fmt(Math.max(0, summary.monthlySpendableRemaining))}
        </div>
        <p className={styles.statusDesc}>
          {getStatusDescription()}
        </p>
        <div className={styles.miniStats}>
          <div className={styles.miniStat}>
            <span className={styles.miniLabel}>남은 일수</span>
            <span className={styles.miniVal}>{isCurrentMonth ? `${daysInMonth - todayDay}일` : '결산 완료'}</span>
          </div>
          <div className={styles.miniDivider} />
          <div className={styles.miniStat}>
            <span className={styles.miniLabel}>하루 권장 예산</span>
            <span className={styles.miniVal}>{fmtShort(dailyLimit)}원</span>
          </div>
        </div>
      </section>

      {/* ── Card 2: Today Outlay ── */}
      <section className={styles.card} onClick={() => navigate(ROUTES.record)}>
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>오늘 지출 현황</span>
          <span className={styles.cardHint}>{todayStr.slice(5).replace('-', '/')}</span>
        </div>
        <div className={styles.todayExpense} style={{ color: todayExpense > 0 ? 'var(--danger)' : 'var(--text-2)' }}>
          {todayExpense > 0 ? `-${fmt(todayExpense)}` : '지출 내역 없음'}
        </div>
        
        {dailyLimit > 0 && (
          <div className={styles.limitBarSection}>
            <div className={styles.limitRow}>
              <span className={styles.limitLabel}>오늘 권장 한도</span>
              <span className={styles.limitVal}>{fmtShort(dailyLimit)}원 ({todayLimitPct}%)</span>
            </div>
            <ProgressBar value={todayLimitPct} max={100} color={todayExpense > dailyLimit ? 'var(--gold-400)' : 'var(--mint-500)'} height={6} />
          </div>
        )}
      </section>

      {/* ── Card 3: Monthly Net Cashflow ── */}
      <section className={styles.card}>
        <span className={styles.cardLabel}>이달의 수지 결산</span>
        <div className={styles.cashflowRow}>
          <div className={styles.cfCol}>
            <span className={styles.cfLabel}>수입</span>
            <span className={styles.cfInc}>+{fmtShort(totalIncome)}원</span>
          </div>
          <div className={styles.cfDivider} />
          <div className={styles.cfCol}>
            <span className={styles.cfLabel}>지출</span>
            <span className={styles.cfExp}>-{fmtShort(totalExpense)}원</span>
          </div>
          <div className={styles.cfDivider} />
          <div className={styles.cfCol}>
            <span className={styles.cfLabel}>순잔액</span>
            <span className={styles.cfNet} style={{ color: netBalance >= 0 ? 'var(--mint-300)' : 'var(--danger)' }}>
              {netBalance >= 0 ? '+' : ''}{fmtShort(netBalance)}원
            </span>
          </div>
        </div>
      </section>

      {/* ── Card 4: Savings target tracker ── */}
      {savingsGoal > 0 && (
        <section className={styles.card} onClick={() => navigate(ROUTES.settings)}>
          <div className={styles.cardHeader}>
            <span className={styles.cardLabel}>저축 목표 달성률</span>
            <span className={`${styles.savingsStatusBadge} ${isOnTrack ? styles.badgeOn : styles.badgeOff}`}>
              {achievePct >= 100 ? '달성 완료' : isOnTrack ? '페이스 양호' : '페이스 미달'}
            </span>
          </div>
          <div className={styles.savingsGoalText}>
            현재 <strong className={styles.mintText}>{fmtShort(currentSavings)}</strong> 저축 중
            <span className={styles.goalSub}> / 목표 {fmtShort(savingsGoal)}원 ({achievePct}%)</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <ProgressBar value={achievePct} max={100} color="var(--mint-500)" height={6} />
          </div>
        </section>
      )}

      {/* ── Card 5: Weekly spendings ── */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>주차별 지출 페이스</span>
          <span className={styles.cardHint}>생활비 예산 기준</span>
        </div>
        <div className={styles.weeklyList}>
          {weekRanges.map((wk, i) => {
            const spent = weekSpent(wk.startOffset, wk.endOffset);
            const budget = weekBudgets[i];
            const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
            const isNow = i === curWeekIdx;
            const barColor = pct >= 100 ? 'var(--safe-5)' : pct >= 80 ? 'var(--safe-3)' : isNow ? 'var(--gold-500)' : 'var(--mint-600)';
            
            return (
              <div key={wk.label} className={`${styles.weeklyItem} ${isNow ? styles.weeklyItemActive : ''}`}>
                <span className={styles.weeklyLabel}>{wk.label}</span>
                <div className={styles.weeklyProgressWrap}>
                  <ProgressBar value={pct} max={100} color={barColor} height={5} />
                </div>
                <span className={styles.weeklySpentText}>{Math.round(spent / 10000)}만원</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Card 6: Recent Outlays ── */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardLabel}>최근 거래 내역</span>
          <button className={styles.viewAllBtn} onClick={() => navigate(ROUTES.record)} type="button">
            전체 <IcArrowRight size={12} />
          </button>
        </div>
        {recentTxs.length === 0 ? (
          <p className={styles.emptyText}>최근 내역이 없습니다.</p>
        ) : (
          <div className={styles.txList}>
            {recentTxs.map(tx => {
              const cat = categoryMap.get(tx.categoryId);
              const color = catColor(tx.categoryId);
              return (
                <div key={tx.id} className={styles.txItem} onClick={() => navigate(ROUTES.record)}>
                  <div className={styles.txLeft}>
                    <div className={styles.catDot} style={{ backgroundColor: color }} />
                    <div className={styles.txTitleWrap}>
                      <span className={styles.txTitle}>{tx.title}</span>
                      <span className={styles.txMeta}>{cat?.name ?? '미분류'} · {shortDate(tx.date)}</span>
                    </div>
                  </div>
                  <span className={styles.txAmount} style={{ color: tx.entryKind === 'income' ? 'var(--mint-300)' : 'var(--text-0)' }}>
                    {tx.entryKind === 'income' ? '+' : '-'}{fmtShort(tx.amount)}원
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Floating Action Button (FAB) for Transaction entry ── */}
      <button
        className={styles.fab}
        onClick={() => navigate(ROUTES.record, { state: { openAddForm: true } })}
        aria-label="거래 추가하기"
        type="button"
      >
        <IcPlus size={24} />
      </button>
    </div>
  );
}
