// HomePage — RESET Budget Design System V2
// Editorial 3-column grid matching Claude Design mockup

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { calcSafetySummary } from '../../domain/safety';
import { buildSafetyInput } from '../../domain/safetyUtils';
import { detectReset } from '../../domain/reset';
import { calcSharedSettlementSummary } from '../../domain/sharedSettlement';
import { getRecurringItems } from '../../storage/localPlanStore';
import type {
  Transaction,
  SafetySummary,
  SharedExpense,
  SettlementTransfer,
  RecurringItem,
} from '../../domain/types';
import { ROUTES } from '../../app/routes';
import {
  IcBell, IcPlus, IcChevronLeft, IcChevronRight,
  IcCheck, IcFlame, IcTrending, IcInfo, IcArrowRight,
  IcSparkle,
} from '../../components/ui/Icons';
import styles from './HomePage.module.css';

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

// ─── CATEGORY COLORS — TOKEN 기반 (RecordPage/BudgetPage 동일 시스템) ──────────
const TOKEN_COLORS: Record<string, string> = {
  amber: '#F4A26B', brown: '#D4A876', coral: '#F08080', indigo: '#9DB6F0',
  blue: '#8AB6F0',  gray: '#8F8D85',  slate: '#8AB0C4', green: '#9DD19D',
  teal: '#7BC4D9',  purple: '#C9A6F0', red: '#F47272', yellow: '#F0D070',
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

// ─── SHARED UI COMPONENTS ────────────────────────────────────────────────────

// Top bar
function TopBar({
  subtitle, title, monthNav, onPrev, onNext, lastSyncedAt,
}: { subtitle: string; title: string; monthNav: string; onPrev: () => void; onNext: () => void; lastSyncedAt: string | null }) {
  const navigate = useNavigate();
  const syncLabel = lastSyncedAt
    ? `동기화됨 · ${new Date(lastSyncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : '동기화 대기';
  return (
    <div className={styles.topBar}>
      <div className={styles.topBarLeft}>
        <div className={styles.topBarSubtitle}>{subtitle}</div>
        <div className={styles.topBarTitle}>{title}</div>
      </div>
      <div className={styles.monthNav}>
        <button className={styles.monthNavBtn} onClick={onPrev} type="button"><IcChevronLeft size={16}/></button>
        <span className={styles.monthNavLabel}>{monthNav}</span>
        <button className={styles.monthNavBtn} onClick={onNext} type="button"><IcChevronRight size={16}/></button>
      </div>
      <div className={styles.topBarRight}>
        <div className={styles.syncPill}>
          <span className={styles.syncDot}/>
          {syncLabel}
        </div>
        <button className={styles.iconBtn} type="button"><IcBell size={18}/></button>
        <button className={styles.primaryBtn} onClick={() => navigate(ROUTES.record)} type="button">
          <IcPlus size={16}/> 거래 추가
        </button>
      </div>
    </div>
  );
}

// SVG Ring
function SafetyRingComp({ score, level }: { score: number; level: string }) {
  const size = 180; const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, score / 200));
  const off = c * (1 - pct);
  const color = safetyColor(level);
  const display = score >= 200 ? '200+' : score <= 0 ? '0' : String(Math.round(score));
  return (
    <div className={styles.ringWrap}>
      <svg width={size} height={size} aria-label={`안전도 ${display}점`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,0.06)"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke}
          stroke={color} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ filter: `drop-shadow(0 0 12px ${color}60)`, transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className={styles.ringInner}>
        <div className={styles.ringScore} style={{ color }}>{display}<span className={styles.ringScorePlus}>{score >= 200 ? '' : ''}</span></div>
        <div className={styles.ringLevel} style={{ color }}>{safetyLabel(level).toUpperCase()}</div>
      </div>
    </div>
  );
}

// Progress bar
function ProgressBar({ value, max = 100, color = 'var(--mint-500)', height = 6 }: {
  value: number; max?: number; color?: string; height?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / (max || 1)) * 100));
  return (
    <div style={{ height, background: 'var(--bg-3)', borderRadius: height/2, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, background: color,
        borderRadius: height/2, transition: 'width 0.6s ease',
        transformOrigin: 'left', animation: 'bar-expand 0.5s ease forwards',
      }}/>
    </div>
  );
}

// CategoryChip (colored square icon)
function CategoryDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }}/>;
}

// Insight row item
function InsightRow({ tone, icon, title, detail }: {
  tone: 'mint' | 'gold' | 'danger' | 'neutral';
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  const colors = {
    mint:    { bg: 'rgba(63,214,164,0.1)',  fg: 'var(--mint-300)'  },
    gold:    { bg: 'rgba(217,178,106,0.1)', fg: 'var(--gold-300)'  },
    danger:  { bg: 'rgba(244,114,114,0.1)', fg: 'var(--danger)'    },
    neutral: { bg: 'var(--bg-3)',           fg: 'var(--text-1)'    },
  };
  const c = colors[tone];
  return (
    <div className={styles.insightRow}>
      <div className={styles.insightIcon} style={{ background: c.bg, color: c.fg }}>{icon}</div>
      <div className={styles.insightContent}>
        <div className={styles.insightTitle}>{title}</div>
        <div className={styles.insightDetail}>{detail}</div>
      </div>
    </div>
  );
}

// Cashflow chart SVG
function CashflowChart({ remaining, fixedExpenses }: {
  remaining: number;
  fixedExpenses: { name: string; amount: number; dueDay: number; color: string }[];
}) {
  const days = 30;
  let running = remaining;
  const proj: number[] = [];
  const sortedFixed = [...fixedExpenses].sort((a, b) => a.dueDay - b.dueDay);
  const today = new Date().getDate();

  for (let i = 0; i < days; i++) {
    const ev = sortedFixed.find(e => e.dueDay === today + i);
    if (ev) running -= ev.amount;
    running -= 55000 + Math.sin(i * 0.8) * 10000;
    proj.push(Math.max(-200000, Math.round(running)));
  }

  const w = 560, h = 140, padY = 24;
  const max = Math.max(...proj, 0);
  const min = Math.min(...proj, 0);
  const range = max - min || 1;
  const yf = (v: number) => padY + (1 - (v - min) / range) * (h - padY * 2);
  const xf = (i: number) => (i / (days - 1)) * w;
  const pts = proj.map((v, i) => `${xf(i).toFixed(1)},${yf(v).toFixed(1)}`).join(' ');
  const fill = `M0,${h - padY} L${pts.split(' ').join(' L')} L${w},${h - padY} Z`;
  const zeroY = yf(0);

  const upcomingEvents = sortedFixed.filter(e => e.dueDay >= today).slice(0, 4);

  return (
    <div>
      <svg width={w} height={h} style={{ display: 'block', width: '100%' }}
        viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3FD6A4" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="#3FD6A4" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1={zeroY} x2={w} y2={zeroY}
          stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="2 4"/>
        <path d={fill} fill="url(#cfGrad)"/>
        <polyline fill="none" stroke="#3FD6A4" strokeWidth="1.5"
          strokeLinecap="round" points={pts}/>
        {upcomingEvents.map((e, i) => {
          const xp = xf(e.dueDay - today);
          const yp = yf(proj[e.dueDay - today] ?? 0);
          return (
            <g key={i}>
              <line x1={xp} y1={padY - 10} x2={xp} y2={h - padY}
                stroke={e.color} strokeWidth="1" strokeDasharray="2 3" opacity="0.5"/>
              <circle cx={xp} cy={yp} r="4" fill={e.color}
                stroke="var(--bg-2)" strokeWidth="2"/>
            </g>
          );
        })}
      </svg>
      {upcomingEvents.length > 0 && (
        <div className={styles.cfEvents}>
          {upcomingEvents.map((e, i) => (
            <div key={i} className={styles.cfEvent} style={{ borderLeftColor: e.color }}>
              <div className={styles.cfEventDate}>D-{e.dueDay - today}</div>
              <div className={styles.cfEventName}>{e.name}</div>
              <div className={styles.cfEventAmt} style={{ color: 'var(--text-1)' }}>-{fmtShort(e.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HomePage ─────────────────────────────────────────────────────────────────

export function HomePage() {
  const config        = useAppStore((s) => s.config);
  const activeMonth   = useAppStore((s) => s.activeMonth);
  const setActiveMonth = useAppStore((s) => s.setActiveMonth);
  const lastSyncedAt  = useAppStore((s) => s.lastSyncedAt);
  const navigate      = useNavigate();

  const [transactions, setTransactions]       = useState<Transaction[]>([]);
  const [prevTransactions, setPrevTransactions] = useState<Transaction[]>([]);
  const [sharedExpenses, setSharedExpenses]   = useState<SharedExpense[]>([]);
  const [transfers, setTransfers]             = useState<SettlementTransfer[]>([]);
  const [resetNeeded, setResetNeeded]         = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [recurringItems, setRecurringItems]   = useState<RecurringItem[]>([]);

  useEffect(() => {
    const [y, m] = activeMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevYMStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
    Promise.all([
      localCache.getTransactions(activeMonth),
      localCache.getTransactions(prevYMStr),
      localCache.getSharedExpenses(activeMonth),
      localCache.getSettlementTransfers(),
    ]).then(([txs, prevTxs, expenses, trs]) => {
      setTransactions(txs);
      setPrevTransactions(prevTxs);
      setSharedExpenses(expenses);
      setTransfers(trs);
    });
    setRecurringItems(getRecurringItems());
  }, [activeMonth]);

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
  }, [activeMonth, config.resetThresholdDays]);

  const handleDismissBanner = () => {
    localStorage.setItem(RESET_DISMISS_KEY, toLocalDateStr(new Date()));
    setBannerDismissed(true);
  };

  // ─── Calculations ──────────────────────────────────────────────────────────
  const safetyInput    = buildSafetyInput(transactions, config);
  const summary: SafetySummary = calcSafetySummary(safetyInput);
  const settlement     = calcSharedSettlementSummary(sharedExpenses, transfers, activeMonth);
  const scoreNum       = Math.round(summary.safetyScore);
  const SAFETY_BAND_IDX: Record<string, number> = {
    critical: 0, risk: 1, warning: 2, safe: 3, very_safe: 4,
  };
  const safetyBandIdx = SAFETY_BAND_IDX[summary.safetyLevel] ?? 3;
  const categoryMap    = new Map(config.categories.map((c) => [c.id, c]));

  const [year, month]  = activeMonth.split('-');
  const today          = new Date();
  const todayStr       = toLocalDateStr(today);
  const todayDay       = today.getDate();
  const [yl, ml]       = activeMonth.split('-').map(Number);
  const daysInMonth    = new Date(yl, ml, 0).getDate();

  const totalIncome    = transactions.filter(t => t.entryKind === 'income').reduce((s,t) => s+t.amount, 0);
  const totalExpense   = transactions.filter(t => t.entryKind === 'expense').reduce((s,t) => s+t.amount, 0);
  const prevTotalExpense = prevTransactions.filter(t => t.entryKind === 'expense').reduce((s,t) => s+t.amount, 0);
  const expenseDiff    = totalExpense - prevTotalExpense;

  const todayExpense   = transactions
    .filter(t => t.entryKind === 'expense' && t.date === todayStr)
    .reduce((s,t) => s+t.amount, 0);

  const dailyLimit     = Math.round(summary.dailyRecommendedLimit);
  const budgetBase     = summary.monthlyBudgetBase;
  // Weekly
  const weeklyBudget   = budgetBase > 0 ? Math.round(budgetBase / 4) : 0;
  const weeks = [
    { label: '1주차', from: 1, to: 7 },
    { label: '2주차', from: 8, to: 14 },
    { label: '3주차', from: 15, to: 21 },
    { label: '4주차', from: 22, to: daysInMonth },
  ];
  function weekSpent(from: number, to: number): number {
    const fStr = `${activeMonth}-${String(from).padStart(2,'0')}`;
    const tStr = `${activeMonth}-${String(to).padStart(2,'0')}`;
    return transactions.filter(t => {
      if (t.entryKind !== 'expense') return false;
      if (t.date < fStr || t.date > tStr) return false;
      return categoryMap.get(t.categoryId)?.budgetGroup === 'living';
    }).reduce((s,t) => s+t.amount, 0);
  }
  const curWeekIdx = todayDay <= 7 ? 0 : todayDay <= 14 ? 1 : todayDay <= 21 ? 2 : 3;

  // Category spending
  const categoryExpenseMap = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.entryKind !== 'expense') continue;
    const cat = categoryMap.get(tx.categoryId);
    if (!cat || cat.budgetGroup !== 'living') continue;
    categoryExpenseMap.set(tx.categoryId, (categoryExpenseMap.get(tx.categoryId) ?? 0) + tx.amount);
  }
  const catSpendArr   = [...categoryExpenseMap.entries()].sort((a,b) => b[1]-a[1]).slice(0, 5);
  const maxCatSpend   = catSpendArr.length > 0 ? catSpendArr[0][1] : 1;
  const topCategoryName = catSpendArr[0] ? (categoryMap.get(catSpendArr[0][0])?.name ?? '미분류') : null;

  // Subscriptions
  const subscriptions     = recurringItems.filter(r => r.kind === 'subscription' && r.enabled);
  const subscriptionTotal = subscriptions.reduce((s,r) => s+r.amount, 0);
  const recurringTotal    = recurringItems.filter(r => r.enabled).reduce((s,r) => s+r.amount, 0);

  // Diagnostics
  const settlementPending = settlement.outstandingReceivable > 0 || settlement.outstandingPayable > 0;
  const settlementPendingAmount = settlement.outstandingReceivable + settlement.outstandingPayable;
  const budgetOk   = summary.safetyLevel === 'very_safe' || summary.safetyLevel === 'safe';
  const budgetWarn = summary.safetyLevel === 'warning';
  const weekOk     = summary.weeklyOverspendRatio <= 1 && summary.monthlySpendableRemaining >= 0;
  const weekWarn   = summary.weeklyOverspendRatio > 1 && summary.monthlySpendableRemaining >= 0;

  // Fixed expenses for cashflow chart
  const fixedForChart = config.fixedExpenses
    .filter(fe => fe.isActive)
    .map(fe => ({
      name: fe.name, amount: fe.amount, dueDay: fe.dueDay,
      color: 'var(--gold-500)',
    }));

  // Upcoming fixed D-Day
  const fixedDDayList = config.fixedExpenses
    .filter(r => r.isActive)
    .map(r => ({
      ...r,
      daysUntil: r.dueDay >= todayDay ? r.dueDay - todayDay : (daysInMonth - todayDay) + r.dueDay,
      isPastThisMonth: r.dueDay < todayDay,
    }))
    .sort((a,b) => a.daysUntil - b.daysUntil);

  // Recent transactions
  const recentTxs = [...transactions]
    .filter(tx => tx.date <= todayStr)
    .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  // Safety feasibility
  function wfLabel() {
    if (summary.monthlySpendableRemaining < 0) return { l: '불가', c: 'var(--safe-5)' };
    if (summary.weeklyOverspendRatio <= 1) return { l: '가능', c: 'var(--safe-1)' };
    return { l: '주의', c: 'var(--safe-3)' };
  }
  const wf = wfLabel();

  const netBalance = totalIncome - totalExpense;
  const todayLimitPct = dailyLimit > 0 ? Math.min(100, Math.round((todayExpense / dailyLimit) * 100)) : 0;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <TopBar
        subtitle={`DASHBOARD · ${year}년 ${Number(month)}월`}
        title="오늘의 재무 컨디션"
        monthNav={`${year}.${month}`}
        onPrev={() => setActiveMonth(prevYM(activeMonth))}
        onNext={() => setActiveMonth(nextYM(activeMonth))}
        lastSyncedAt={lastSyncedAt}
      />

      {/* ── Reset banner ── */}
      {resetNeeded && !bannerDismissed && (
        <div className={styles.resetBanner}>
          <span className={styles.resetBannerIcon}>⚠</span>
          <div className={styles.resetBannerText}>
            <span className={styles.resetBannerTitle}>기록 공백 감지</span>
            <span className={styles.resetBannerDesc}>{config.resetThresholdDays}일 이상 기록이 없습니다</span>
          </div>
          <div className={styles.resetBannerActions}>
            <button className={styles.resetBannerBtn} onClick={() => navigate(ROUTES.reset)} type="button">복귀하기</button>
            <button className={styles.resetBannerDismiss} onClick={handleDismissBanner} type="button" aria-label="닫기">✕</button>
          </div>
        </div>
      )}

      <div className={styles.scroll}>

        {/* ══ Row 1: 3-column grid ══ */}
        <div className={styles.grid3}>

          {/* HERO — Safety score (spans 2 rows) */}
          <div
            className={styles.heroCard}
            onClick={() => navigate(ROUTES.safety)}
            role="button" tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && navigate(ROUTES.safety)}
          >
            <div className={styles.heroTopPill}>
              <IcSparkle size={12}/> 상위 3%
            </div>
            <div className={styles.heroLabelSmall}>SAFETY SCORE · 재무 안전도</div>

            <div className={styles.heroBody}>
              <SafetyRingComp score={scoreNum} level={summary.safetyLevel}/>
              <div className={styles.heroInfo}>
                <div className={styles.heroRemaining}>
                  <div className={styles.heroRemainingLabel}>남은 생활비</div>
                  <div className={styles.heroRemainingValue}>
                    {fmtShort(Math.max(0, summary.monthlySpendableRemaining))}
                    <span className={styles.heroRemainingUnit}>원</span>
                  </div>
                  <div className={styles.heroRemainingHint}>
                    월말까지 <span className={styles.heroMint}>{daysInMonth - todayDay}일</span> 남음 · 일 평균 예산 <span className={styles.mono}>{fmtShort(dailyLimit)}원</span>
                  </div>
                </div>
                {/* Safety band */}
                <div className={styles.safetyBand}>
                  {(['위기','위험','주의','안전','매우안전'] as const).map((t, i) => (
                    <div key={t} className={`${styles.safetyBandItem} ${i === safetyBandIdx ? styles.safetyBandItemActive : ''}`}>
                      {t}
                    </div>
                  ))}
                </div>
                <div className={styles.safetyGradient}>
                  <div className={styles.safetyGradientMarker}
                    style={{ left: `${Math.min(96, Math.round((scoreNum / 200) * 100))}%` }}/>
                </div>
              </div>
            </div>

            {/* Mini stats */}
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <div className={styles.heroStatLabel}>고정지출 커버</div>
                <div className={styles.heroStatValue} style={{ color: 'var(--mint-300)' }}>
                  {Math.floor(summary.monthlySpendableRemaining / Math.max(1, config.fixedExpenses.reduce((s,f)=>s+f.amount,0)))}개월분
                </div>
                <div className={styles.heroStatHint}>비상금</div>
              </div>
              <div className={styles.heroStat}>
                <div className={styles.heroStatLabel}>이번 주 예산</div>
                <div className={styles.heroStatValue} style={{ color: wf.c }}>{wf.l}</div>
                <div className={styles.heroStatHint}>현재 진행</div>
              </div>
              <div className={styles.heroStat}>
                <div className={styles.heroStatLabel}>다음 달 전망</div>
                <div className={styles.heroStatValue} style={{ color: 'var(--gold-300)' }}>
                  {netBalance >= 0 ? '+' : ''}{fmtShort(netBalance)}원
                </div>
                <div className={styles.heroStatHint}>예측</div>
              </div>
            </div>
          </div>

          {/* Today card */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>오늘 · {todayStr.slice(5).replace('-', '/')}</div>
            <div className={styles.todayExpense} style={{ color: todayExpense > 0 ? 'var(--danger)' : 'var(--text-2)' }}>
              {todayExpense > 0 ? `-${fmt(todayExpense)}` : '지출 없음'}
            </div>
            <div className={styles.cardSubtle}>
              {dailyLimit > 0 && todayExpense > dailyLimit
                ? <span style={{ color: 'var(--gold-300)' }}>일 한도 초과</span>
                : <span style={{ color: 'var(--text-2)' }}>어제 대비 양호</span>}
            </div>
            <div style={{ marginTop: 16 }}>
              <div className={styles.progressRow}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>오늘 한도</span>
                <span className={styles.mono} style={{ fontSize: 12, color: 'var(--text-1)' }}>{fmt(dailyLimit)}</span>
              </div>
              <ProgressBar value={todayLimitPct} max={100} color="var(--mint-500)" height={5}/>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                {transactions.filter(t=>t.date===todayStr).length}건의 거래
              </div>
            </div>
          </div>

          {/* Monthly cashflow card */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>이번 달 수지</div>
            <div className={styles.incExpGrid}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>수입</div>
                <div className={styles.incomeAmt}>+{fmtShort(totalIncome)}원</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>지출</div>
                <div className={styles.expenseAmt}>-{fmtShort(totalExpense)}원</div>
              </div>
            </div>
            <div className={styles.netRow}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>순잔액</span>
              <span className={styles.netAmount} style={{ color: netBalance >= 0 ? 'var(--mint-300)' : 'var(--danger)' }}>
                {netBalance >= 0 ? '+' : ''}{fmt(netBalance)}
              </span>
            </div>
            {totalIncome + totalExpense > 0 && (
              <>
                <div className={styles.ratioBar}>
                  <div style={{ flex: totalIncome, background: 'var(--mint-500)' }}/>
                  <div style={{ flex: totalExpense, background: 'var(--danger)', opacity: 0.9 }}/>
                </div>
                <div className={styles.ratioLabels}>
                  <span style={{ color: 'var(--mint-500)' }}>수입 {Math.round(totalIncome/(totalIncome+totalExpense)*100)}%</span>
                  <span style={{ color: 'var(--danger)' }}>지출 {Math.round(totalExpense/(totalIncome+totalExpense)*100)}%</span>
                </div>
              </>
            )}
            {prevTotalExpense > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: expenseDiff > 0 ? 'var(--danger)' : 'var(--mint-300)' }}>
                전월 대비 {expenseDiff > 0 ? '+' : ''}{fmtShort(expenseDiff)}원
              </div>
            )}
          </div>

          {/* Weekly budget card (row 2 of col 2) */}
          <div className={styles.card}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardLabel}>주차별 예산 진행</div>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>총 {fmtShort(budgetBase)}원</span>
            </div>
            <div className={styles.weeklyList}>
              {weeks.map((wk, i) => {
                const spent = weekSpent(wk.from, wk.to);
                const pct = weeklyBudget > 0 ? Math.min(100, Math.round((spent/weeklyBudget)*100)) : 0;
                const isNow = i === curWeekIdx;
                const barC = pct >= 100 ? 'var(--safe-5)' : pct >= 80 ? 'var(--safe-3)' : isNow ? 'var(--gold-500)' : 'var(--mint-600)';
                return (
                  <div key={wk.label} className={styles.weeklyItem}>
                    <span className={styles.weeklyLabel} style={{ color: isNow ? 'var(--gold-300)' : 'var(--text-2)', fontWeight: isNow ? 600 : 500 }}>
                      {wk.label}
                    </span>
                    <div style={{ flex: 1 }}>
                      <ProgressBar value={pct} max={100} color={barC} height={6}/>
                    </div>
                    <span className={`${styles.weeklyAmt} ${styles.mono}`}>{Math.round(spent/10000)}만</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category spending card (row 2 of col 3) */}
          <div className={styles.card}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardLabel}>카테고리별 지출</div>
              <button className={styles.textLink} onClick={() => navigate(ROUTES.record)} type="button">
                전체 <IcArrowRight size={11}/>
              </button>
            </div>
            {catSpendArr.length === 0 ? (
              <p className={styles.empty}>이번 달 생활비 지출이 없습니다</p>
            ) : (
              <div className={styles.catList}>
                {catSpendArr.map(([catId, amount]) => {
                  const cat = categoryMap.get(catId);
                  const pct = Math.round((amount / maxCatSpend) * 100);
                  const color = catColor(catId, cat?.colorToken);
                  return (
                    <div key={catId} className={styles.catItem}>
                      <CategoryDot color={color} size={8}/>
                      <div className={styles.catContent}>
                        <div className={styles.catRow}>
                          <span style={{ fontSize: 12, color: 'var(--text-1)' }}>{cat?.name ?? '미분류'}</span>
                          <span className={styles.mono} style={{ fontSize: 11, color: 'var(--text-2)' }}>
                            {Math.round((amount/totalExpense)*100)||0}%
                          </span>
                        </div>
                        <ProgressBar value={pct} max={100} color={color} height={3}/>
                      </div>
                      <span className={styles.mono} style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                        {fmtShort(amount)}원
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══ Row 2: 1.5fr 1fr 1fr ══ */}
        <div className={styles.grid3b}>

          {/* Cashflow chart */}
          <div className={styles.card}>
            <div className={styles.cardHeaderRow}>
              <div>
                <div className={styles.cardLabel}>CASH FLOW TIMELINE</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>남은 기간 현금 흐름 예측</div>
              </div>
              {fixedDDayList.length > 0 && (
                <div className={styles.goldPill}>
                  {fixedDDayList[0].name} · D-{fixedDDayList[0].daysUntil}
                </div>
              )}
            </div>
            <CashflowChart
              remaining={summary.monthlySpendableRemaining}
              fixedExpenses={fixedForChart}
            />
          </div>

          {/* Diagnostics */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>이번 달 핵심 진단</div>
            <div className={styles.insightList}>
              <InsightRow
                tone={budgetOk ? 'mint' : budgetWarn ? 'gold' : 'danger'}
                icon={budgetOk ? <IcCheck size={14}/> : <IcFlame size={14}/>}
                title={budgetOk ? '예산 페이스 양호' : budgetWarn ? '예산 주의 필요' : '예산 초과 위험'}
                detail={topCategoryName ? `${topCategoryName} 지출 최다 · 일 평균 유지` : '일 평균 자산 내 유지'}
              />
              <InsightRow
                tone={weekOk ? 'mint' : weekWarn ? 'gold' : 'danger'}
                icon={<IcTrending size={14}/>}
                title={`이번 주 ${wf.l}`}
                detail={weekOk ? '주간 예산 내에서 진행 중' : '주간 속도 주의가 필요합니다'}
              />
              <InsightRow
                tone="mint"
                icon={<IcSparkle size={14}/>}
                title={`구독료 ${fmt(subscriptionTotal)}/월`}
                detail={`${subscriptions.length}건 구독 중 · 월 총 정기 ${fmtShort(recurringTotal)}원`}
              />
              <InsightRow
                tone={settlementPending ? 'gold' : 'neutral'}
                icon={<IcInfo size={14}/>}
                title={settlementPending ? `공동정산 미정산 ${fmt(settlementPendingAmount)}` : '공동정산 완료'}
                detail={settlementPending ? '정산 대기 중 · 확인 필요' : '이번 달 정산 완료'}
              />
            </div>
          </div>

          {/* Subscriptions */}
          <div className={styles.card}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardLabel}>구독 · 정기 점검</div>
              <div className={styles.mintPill}>총 {fmtShort(subscriptionTotal)}원/월</div>
            </div>
            {subscriptions.length === 0 ? (
              <div className={styles.emptyCenter}>
                <p style={{ fontSize: 13, color: 'var(--text-2)' }}>등록된 구독이 없습니다</p>
                <button className={styles.emptyAction} onClick={() => navigate(ROUTES.recurring)} type="button">+ 구독 등록</button>
              </div>
            ) : (
              <div className={styles.subList}>
                {subscriptions.slice(0, 4).map(sub => (
                  <div key={sub.id} className={styles.subItem}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(232,154,194,0.15)', color: '#E89AC2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11 }}>●</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{sub.providerName ?? sub.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>매월 자동 결제</div>
                    </div>
                    <span className={styles.mono} style={{ fontSize: 13, fontWeight: 600 }}>{fmtShort(sub.amount)}원</span>
                  </div>
                ))}
                {subscriptions.length > 4 && (
                  <p style={{ fontSize: 11, color: 'var(--text-2)', textAlign: 'center', marginTop: 6 }}>외 {subscriptions.length - 4}개 더...</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ Recent transactions ══ */}
        <div className={styles.card}>
          <div className={styles.cardHeaderRow}>
            <div>
              <div className={styles.cardLabel}>최근 거래</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>지난 3일 · {recentTxs.length}건</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className={styles.textLink} onClick={() => navigate(ROUTES.record)} type="button">
                전체 보기 <IcArrowRight size={12}/>
              </button>
            </div>
          </div>
          {recentTxs.length === 0 ? (
            <div className={styles.emptyState}>
              <p style={{ color: 'var(--text-2)' }}>이번 달 거래가 없습니다</p>
              <button className={styles.emptyAction} onClick={() => navigate(ROUTES.record)} type="button">+ 거래 기록하기</button>
            </div>
          ) : (
            <div className={styles.txGrid}>
              {recentTxs.map(tx => {
                const cat = categoryMap.get(tx.categoryId);
                const color = catColor(tx.categoryId);
                return (
                  <div key={tx.id} className={styles.txItem}>
                    <div className={styles.txIcon} style={{ background: `${color}22`, color }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{cat?.name?.slice(0,1) ?? '?'}</span>
                    </div>
                    <div className={styles.txInfo}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                        {cat?.name ?? '미분류'} · {shortDate(tx.date)}
                      </div>
                    </div>
                    <span className={styles.mono} style={{
                      fontSize: 14, fontWeight: 600,
                      color: tx.entryKind === 'income' ? 'var(--mint-300)' : 'var(--text-0)',
                    }}>
                      {tx.entryKind === 'income' ? '+' : '-'}{fmtShort(tx.amount)}원
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
