// StatsMonthlyPage — Design System V2
// Editorial layout: DonutChart + CalHeat + 30-day bar + 3-col bottom

import { useState, useEffect } from 'react';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { BottomSheet } from '../../components/ui/BottomSheet';
import type { Transaction, Category } from '../../domain/types';
import {
  IcChevronLeft, IcChevronRight,
} from '../../components/ui/Icons';
import { getBudgetPeriodForMonth, getMonthsInPeriod, toLocalDateStr } from '../../domain/safetyUtils';
import styles from './StatsMonthlyPage.module.css';

// ─── Category colors ──────────────────────────────────────────────────────────

// colorToken → hex (matches fixtures.ts colorToken values)
const TOKEN_COLORS: Record<string, string> = {
  amber:   '#F4A26B',
  brown:   '#D4A876',
  coral:   '#F08080',
  indigo:  '#9DB6F0',
  blue:    '#8AB6F0',
  gray:    '#8F8D85',
  slate:   '#8AB0C4',
  green:   '#9DD19D',
  teal:    '#7BC4D9',
  purple:  '#C9A6F0',
  red:     '#F47272',
  yellow:  '#F0D070',
  orange:  '#F4A060',
  emerald: '#3FD6A4',
  lime:    '#A8D96C',
};

// Fallback palette for unknown tokens
const PALETTE = [
  '#F4A26B','#8AB6F0','#D9B26A','#9DD19D','#C9A6F0',
  '#7BC4D9','#F08080','#F0D070','#D4A876','#8AC4B0',
  '#A8D96C','#F09A8A','#9DB6F0','#3FD6A4','#8F8D85',
];

function catColor(catId: string, colorToken?: string): string {
  if (colorToken && TOKEN_COLORS[colorToken]) return TOKEN_COLORS[colorToken];
  // stable hash for consistent color per unknown catId
  let h = 0;
  for (let i = 0; i < catId.length; i++) h = (h * 31 + catId.charCodeAt(i)) & 0xffff;
  return PALETTE[h % PALETTE.length];
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function prevYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(n: number): string { return n.toLocaleString('ko-KR') + '원'; }
function fmtK(n: number): string {
  if (n >= 10_000) return Math.round(n / 10_000) + '만';
  if (n >= 1_000)  return Math.round(n / 1_000) + 'k';
  return String(n);
}



interface CategoryStat {
  category: Category | undefined;
  catId: string;
  total: number;
  count: number;
  percent: number;
}

function calcCategoryStats(transactions: Transaction[], categories: Category[]): CategoryStat[] {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const expenseTxs = transactions.filter((t) => t.entryKind === 'expense');
  const totalExpense = expenseTxs.reduce((s, t) => s + t.amount, 0);
  const grouped = new Map<string, number>();
  for (const tx of expenseTxs) {
    grouped.set(tx.categoryId, (grouped.get(tx.categoryId) ?? 0) + tx.amount);
  }
  return Array.from(grouped.entries())
    .map(([catId, total]) => ({
      category: catMap.get(catId),
      catId,
      total,
      count: expenseTxs.filter((t) => t.categoryId === catId).length,
      percent: totalExpense > 0 ? (total / totalExpense) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
}

function buildDailyMap(transactions: Transaction[]): Map<string, { expense: number; income: number }> {
  const map = new Map<string, { expense: number; income: number }>();
  for (const tx of transactions) {
    const existing = map.get(tx.date) ?? { expense: 0, income: 0 };
    if (tx.entryKind === 'expense') existing.expense += tx.amount;
    else if (tx.entryKind === 'income') existing.income += tx.amount;
    map.set(tx.date, existing);
  }
  return map;
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ cats }: { cats: CategoryStat[] }) {
  const size = 240; const r = 90; const cx = size / 2; const cy = size / 2;
  const total = cats.reduce((s, c) => s + c.total, 0);
  if (total <= 0) return null; // 지출 합계 0이면 NaN arc 방지
  let acc = 0;
  const arcs = cats.map((c) => {
    const start = (acc / total) * Math.PI * 2;
    acc += c.total;
    const end = (acc / total) * Math.PI * 2;
    const x1 = cx + Math.cos(start - Math.PI / 2) * r;
    const y1 = cy + Math.sin(start - Math.PI / 2) * r;
    const x2 = cx + Math.cos(end - Math.PI / 2) * r;
    const y2 = cy + Math.sin(end - Math.PI / 2) * r;
    const large = end - start > Math.PI ? 1 : 0;
    const color = catColor(c.catId, c.category?.colorToken);
    return (
      <path key={c.catId}
        d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`}
        fill={color} opacity={0.9}
        stroke="var(--bg-2)" strokeWidth={2}
      />
    );
  });
  return (
    <div className={styles.donutWrap}>
      <div style={{ position: 'relative', flexShrink: 0, width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size}>{arcs}
          <circle cx={cx} cy={cy} r={54} fill="var(--bg-2)"/>
        </svg>
        <div className={styles.donutCenter}>
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>총 지출</div>
          <div className={styles.donutTotal}>{Math.round(total / 10_000)}<span style={{ fontSize: 12, color: 'var(--text-2)' }}>만원</span></div>
        </div>
      </div>
      <div className={styles.donutLegend}>
        {cats.slice(0, 8).map((c) => (
          <div key={c.catId} className={styles.donutRow}>
            <span className={styles.donutDot} style={{ background: catColor(c.catId, c.category?.colorToken) }}/>
            <span className={styles.donutName}>{c.category?.name ?? '기타'}</span>
            <span className={styles.donutPct}>{c.percent.toFixed(0)}%</span>
            <span className={styles.donutAmt}>{fmt(c.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CalHeat ──────────────────────────────────────────────────────────────────

function CalHeat({
  start, end, dailyMap, maxDailyExpense, weekStartDay, onSelectDate, selectedDate,
}: {
  start: Date;
  end: Date;
  dailyMap: Map<string, { expense: number; income: number }>;
  maxDailyExpense: number;
  weekStartDay: number;
  onSelectDate: (d: string | null) => void;
  selectedDate: string | null;
}) {
  const startDayOfWeek = start.getDay();
  const firstOffset = (startDayOfWeek - weekStartDay + 7) % 7;
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const weekDayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const orderedLabels = [...weekDayLabels.slice(weekStartDay), ...weekDayLabels.slice(0, weekStartDay)];

  return (
    <div>
      <div className={styles.calWeekRow}>
        {orderedLabels.map((l) => <div key={l} className={styles.calWeekLabel}>{l}</div>)}
      </div>
      <div className={styles.calGrid}>
        {Array.from({ length: firstOffset }).map((_, i) => <div key={`e${i}`}/>)}
        {Array.from({ length: totalDays }, (_, i) => {
          const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
          const dateStr = toLocalDateStr(date);
          const day = date.getDate();
          const monthLabel = date.getDate() === 1 ? `${date.getMonth() + 1}/` : '';

          const data = dailyMap.get(dateStr);
          const intensity = data?.expense ? Math.min(1, data.expense / maxDailyExpense) : 0;
          const isSelected = selectedDate === dateStr;
          const hasData = !!(data?.expense || data?.income);
          return (
            <div key={dateStr}
              className={`${styles.calCell} ${isSelected ? styles.calCellSelected : ''}`}
              style={{
                background: data?.expense
                  ? `rgba(63,214,164,${0.15 + intensity * 0.6})`
                  : data?.income ? 'rgba(63,214,164,0.08)' : 'var(--bg-3)',
                cursor: hasData ? 'pointer' : 'default',
              }}
              onClick={() => hasData && onSelectDate(isSelected ? null : dateStr)}
            >
              <span className={styles.calDay}>{monthLabel}{day}</span>
              {data?.expense ? <span className={styles.calAmt} style={{ opacity: 0.4 + intensity * 0.6 }}>{fmtK(data.expense)}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BarChart 30-day ──────────────────────────────────────────────────────────

function DailyBarChart({ data }: { data: { day: number; amount: number }[] }) {
  const max = Math.max(1, ...data.map(d => d.amount));
  return (
    <div className={styles.barChart}>
      {data.map((d) => {
        const h = d.amount > 0 ? Math.max(3, (d.amount / max) * 100) : 0;
        const isMax = d.amount === max && max > 0;
        return (
          <div key={d.day} className={styles.barCol}>
            <div className={styles.barFill}
              style={{
                height: `${h}%`,
                background: isMax ? 'var(--gold-500)' : 'var(--mint-500)',
                opacity: h > 0 ? (0.35 + (h / 100) * 0.65) : 0,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── StatsMonthlyPage ─────────────────────────────────────────────────────────

export function StatsMonthlyPage() {
  const config      = useAppStore(s => s.config);
  const activeMonth = useAppStore(s => s.activeMonth);
  const setActiveMonth = useAppStore(s => s.setActiveMonth);
  const lastSyncedAt = useAppStore(s => s.lastSyncedAt);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prevTransactions, setPrevTransactions] = useState<Transaction[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const { start: curStart, end: curEnd } = getBudgetPeriodForMonth(activeMonth, config);
    const curMonths = getMonthsInPeriod(curStart, curEnd);
    const curStartStr = toLocalDateStr(curStart);
    const curEndStr = toLocalDateStr(curEnd);

    const prevYMStr = prevYM(activeMonth);
    const { start: prevStart, end: prevEnd } = getBudgetPeriodForMonth(prevYMStr, config);
    const prevMonths = getMonthsInPeriod(prevStart, prevEnd);
    const prevStartStr = toLocalDateStr(prevStart);
    const prevEndStr = toLocalDateStr(prevEnd);

    Promise.all(curMonths.map(ym => localCache.getTransactions(ym)))
      .then(results => {
        const allTxs = results.flat();
        setTransactions(allTxs.filter(t => t.date >= curStartStr && t.date <= curEndStr));
      });

    Promise.all(prevMonths.map(ym => localCache.getTransactions(ym)))
      .then(results => {
        const allTxs = results.flat();
        setPrevTransactions(allTxs.filter(t => t.date >= prevStartStr && t.date <= prevEndStr));
      });
  }, [activeMonth, lastSyncedAt, config]);

  // Aggregate
  const totalExpense = transactions.filter(t => t.entryKind === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome  = transactions.filter(t => t.entryKind === 'income').reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpense;
  const txCount = transactions.length;

  const categoryStats = calcCategoryStats(transactions, config.categories);
  const dailyMap = buildDailyMap(transactions);
  const maxDailyExpense = Math.max(1, ...Array.from(dailyMap.values()).map(v => v.expense));

  const { start: periodStart, end: periodEnd } = getBudgetPeriodForMonth(activeMonth, config);
  const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const dailyExpenses = Array.from({ length: totalDays }, (_, i) => {
    const date = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + i);
    const dateStr = toLocalDateStr(date);
    return { day: i + 1, dateStr, amount: dailyMap.get(dateStr)?.expense ?? 0 };
  });

  // Stats for bar chart header
  const maxDailyAmt = Math.max(0, ...dailyExpenses.map(d => d.amount));
  
  // avgDailyAmt: 경과 일수 기준
  const today = new Date();
  
  let elapsedDays = totalDays;
  if (today >= periodStart && today <= periodEnd) {
    const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startZero = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
    elapsedDays = Math.round((todayZero.getTime() - startZero.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  } else if (today < periodStart) {
    elapsedDays = 0;
  }

  const avgDailyAmt = elapsedDays > 0 ? Math.round(totalExpense / elapsedDays) : 0;
  // 무지출일: 미래 날짜는 제외
  const zeroDays = dailyExpenses.filter(d => {
    const dDate = new Date(d.dateStr);
    return dDate <= today && d.amount === 0;
  }).length;

  // Day-of-week analysis (0=Sun ... 6=Sat)
  const DOW_KO = ['일','월','화','수','목','금','토'];
  const dowSpend = new Array(7).fill(0);
  const dowCount = new Array(7).fill(0);
  for (const tx of transactions) {
    if (tx.entryKind !== 'expense') continue;
    const dow = new Date(tx.date + 'T00:00:00').getDay(); // 로컬 시간 기준 (UTC 파싱 방지)
    dowSpend[dow] += tx.amount;
    dowCount[dow]++;
  }
  const dowAvg = dowSpend.map((s, i) => (dowCount[i] > 0 ? s / dowCount[i] : 0));
  const rawMaxDow = Math.max(0, ...dowAvg);
  const maxDow = Math.max(1, rawMaxDow); // 바 높이 계산용 분모
  // 지출이 없으면 -1로 설정해 강조 없음 처리 (0 대신 일요일이 강조되는 오류 방지)
  const maxDowIdx = rawMaxDow > 0 ? dowAvg.indexOf(rawMaxDow) : -1;

  // Payment method — paymentMethodId로 이름 조회
  const pmLookup = new Map(config.paymentMethods.map(p => [p.id, p.name]));
  const pmMap = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.entryKind !== 'expense') continue;
    const pmName = tx.paymentMethodId ? (pmLookup.get(tx.paymentMethodId) ?? '기타') : '기타';
    pmMap.set(pmName, (pmMap.get(pmName) ?? 0) + tx.amount);
  }
  const pmList = Array.from(pmMap.entries())
    .map(([l, v]) => ({ l, v, pct: totalExpense > 0 ? Math.round(v / totalExpense * 100) : 0 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 4);

  // MoM comparison
  const prevCatMap = new Map<string, number>();
  for (const tx of prevTransactions) {
    if (tx.entryKind !== 'expense') continue;
    prevCatMap.set(tx.categoryId, (prevCatMap.get(tx.categoryId) ?? 0) + tx.amount);
  }
  const momList = categoryStats.slice(0, 4).map(c => {
    const prev = prevCatMap.get(c.catId) ?? 0;
    // 전월 지출 0이면 null로 표시 ("▼ 0%"가 아닌 "신규"로 구분)
    const delta = prev > 0 ? Math.round((c.total - prev) / prev * 100) : null;
    return { l: c.category?.name ?? '기타', d: delta, n: c.total };
  });

  // Selected date transactions
  const categoryMap = new Map(config.categories.map(c => [c.id, c]));
  const selectedTxs = selectedDate
    ? transactions.filter(t => t.date === selectedDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  const monthLabel = activeMonth.replace('-', '.');

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.subtitle}>STATISTICS</div>
          <div className={styles.title}>통계</div>
        </div>
        <div className={styles.monthNav}>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(prevYM(activeMonth))} type="button"><IcChevronLeft size={16}/></button>
          <span className={styles.monthLabel}>{monthLabel}</span>
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
              {net >= 0 ? '+' : ''}{fmt(net)}
            </div>
          </div>
          <div className={styles.topStat}>
            <div className={styles.topStatLabel}>거래</div>
            <div className={styles.topStatVal}>{txCount}건</div>
          </div>
        </div>
      </div>

      <div className={styles.scroll}>

        {/* ── Top 2-col: Donut + CalHeat ── */}
        <div className={styles.grid2}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardLabel}>카테고리별 지출 · TOP 12</div>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>전체 {fmt(totalExpense)}</span>
            </div>
            {categoryStats.length > 0
              ? <DonutChart cats={categoryStats}/>
              : <div className={styles.empty}>이번 달 지출이 없습니다</div>
            }
          </div>

          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.cardLabel}>일별 지출 달력</div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>색 진할수록 지출 많음</span>
            </div>
            <CalHeat
              start={periodStart}
              end={periodEnd}
              dailyMap={dailyMap}
              maxDailyExpense={maxDailyExpense}
              weekStartDay={config.weekStartDay}
              onSelectDate={setSelectedDate}
              selectedDate={selectedDate}
            />
          </div>
        </div>

        {/* ── Full-width 30-day bar chart ── */}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <div className={styles.cardLabel}>일별 지출 추이</div>
              <div className={styles.barChartTitle}>지난 {totalDays}일 소비 리듬</div>
            </div>
            <div className={styles.barChartStats}>
              <div className={styles.barStat}>
                <div className={styles.barStatLabel}>일 최대</div>
                <div className={styles.barStatVal} style={{ color: 'var(--gold-300)' }}>{fmt(maxDailyAmt)}</div>
              </div>
              <div className={styles.barStat}>
                <div className={styles.barStatLabel}>일 평균</div>
                <div className={styles.barStatVal}>{fmt(Math.round(avgDailyAmt))}</div>
              </div>
              <div className={styles.barStat}>
                <div className={styles.barStatLabel}>무지출</div>
                <div className={styles.barStatVal}>{zeroDays}<span style={{ fontSize: 11, color: 'var(--text-2)' }}>일</span></div>
              </div>
            </div>
          </div>
          <DailyBarChart data={dailyExpenses}/>
          <div className={styles.barAxisLabels}>
            {(() => {
              const fmtDate = (d: Date) => `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
              const d1 = periodStart;
              const d2 = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + Math.round(totalDays * 0.25));
              const d3 = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + Math.round(totalDays * 0.5));
              const d4 = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + Math.round(totalDays * 0.75));
              const d5 = periodEnd;
              return (
                <>
                  <span>{fmtDate(d1)}</span>
                  <span>{fmtDate(d2)}</span>
                  <span>{fmtDate(d3)}</span>
                  <span>{fmtDate(d4)}</span>
                  <span>{fmtDate(d5)}</span>
                </>
              );
            })()}
          </div>
        </div>

        {/* ── Bottom 3-col ── */}
        <div className={styles.grid3}>

          {/* 요일별 평균 */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>요일별 평균</div>
            <div className={styles.dowChart}>
              {dowAvg.map((v, i) => {
                const h = maxDow > 0 ? Math.max(4, (v / maxDow) * 90) : 4;
                const isMax = i === maxDowIdx;
                return (
                  <div key={i} className={styles.dowCol}>
                    <div className={styles.dowBar}
                      style={{
                        height: h,
                        background: isMax ? 'var(--gold-500)' : 'var(--mint-500)',
                        opacity: isMax ? 1 : 0.4,
                      }}
                    />
                    <div className={styles.dowLabel}>{DOW_KO[i]}</div>
                  </div>
                );
              })}
            </div>
            {maxDowIdx >= 0 && maxDow > 1 && (
              <div className={styles.dowInsight}>{DOW_KO[maxDowIdx]}요일에 지출이 가장 많아요</div>
            )}
          </div>

          {/* 결제수단별 */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>결제수단별</div>
            {pmList.length > 0 ? pmList.map((p, i) => (
              <div key={i} className={styles.pmRow}>
                <div className={styles.pmRowHead}>
                  <span className={styles.pmName}>{p.l}</span>
                  <span className={styles.pmAmt}>{fmt(p.v)}</span>
                </div>
                <div className={styles.progTrack}>
                  <div className={styles.progFill} style={{ width: `${p.pct}%` }}/>
                </div>
              </div>
            )) : <div className={styles.empty}>데이터 없음</div>}
          </div>

          {/* 전월 대비 */}
          <div className={styles.card}>
            <div className={styles.cardLabel}>전월 대비</div>
            {momList.length > 0 ? momList.map((r, i) => (
              <div key={i} className={styles.momRow}>
                <span className={styles.momCat}>{r.l}</span>
                <span className={styles.momAmt}>{fmt(r.n)}</span>
                {prevCatMap.size > 0 && (
                  r.d !== null ? (
                    <span className={styles.momDelta} style={{ color: r.d > 0 ? 'var(--danger)' : r.d < 0 ? 'var(--mint-300)' : 'var(--text-2)' }}>
                      {r.d > 0 ? '▲' : r.d < 0 ? '▼' : '─'} {Math.abs(r.d)}%
                    </span>
                  ) : (
                    <span className={styles.momDelta} style={{ color: 'var(--text-3)', fontSize: 10 }}>신규</span>
                  )
                )}
              </div>
            )) : <div className={styles.empty}>데이터 없음</div>}
          </div>

        </div>
      </div>

      {/* ── BottomSheet (mobile) ── */}
      <BottomSheet
        open={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        title={selectedDate ? `${Number(selectedDate.split('-')[1])}/${Number(selectedDate.split('-')[2])} 거래 내역` : ''}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {selectedTxs.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-2)', padding: '12px 0' }}>거래가 없습니다</p>
            : selectedTxs.map(tx => {
              const cat = categoryMap.get(tx.categoryId);
              return (
                <div key={tx.id} className={styles.txItem}>
                  <div className={styles.txIcon}
                    style={{ background: `${catColor(tx.categoryId, cat?.colorToken)}22`, color: catColor(tx.categoryId, cat?.colorToken) }}>
                    {cat?.icon ?? (tx.entryKind === 'income' ? '💰' : '💸')}
                  </div>
                  <div className={styles.txInfo}>
                    <span className={styles.txTitle}>{tx.title}</span>
                    <span className={styles.txMeta}>{cat?.name ?? '미분류'}{tx.memo ? ` · ${tx.memo}` : ''}</span>
                  </div>
                  <span className={styles.txAmt}
                    style={{ color: tx.entryKind === 'income' ? 'var(--mint-300)' : 'var(--danger)' }}>
                    {tx.entryKind === 'income' ? '+' : '−'}{fmt(tx.amount)}
                  </span>
                </div>
              );
            })
          }
        </div>
      </BottomSheet>
    </div>
  );
}
