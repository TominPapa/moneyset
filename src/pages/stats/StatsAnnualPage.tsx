// StatsAnnualPage — RESET Budget V2 (PC Dashboard Layout)

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { buildSafetyInput } from '../../domain/safetyUtils';
import { calcSafetySummary } from '../../domain/safety';
import type { Transaction, Category } from '../../domain/types';
import { ROUTES } from '../../app/routes';
import styles from './StatsAnnualPage.module.css';

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

function fmtShort(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function ymOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function safetyColor(level: string): string {
  const map: Record<string, string> = {
    very_safe: 'var(--safety-very-safe)',
    safe:      'var(--safety-safe)',
    warning:   'var(--safety-warning)',
    risk:      'var(--safety-risk)',
    critical:  'var(--safety-critical)',
  };
  return map[level] ?? 'var(--text-muted)';
}

function safetyLabel(level: string): string {
  const map: Record<string, string> = {
    very_safe: '매안',
    safe:      '안전',
    warning:   '주의',
    risk:      '위험',
    critical:  '위기',
  };
  return map[level] ?? '-';
}

interface MonthData {
  ym: string;
  month: number;
  income: number;
  expense: number;
  transactions: Transaction[];
}

interface AnnualCategoryStat {
  category: Category | undefined;
  total: number;
  percent: number;
}

// ─── StatsAnnualPage ──────────────────────────────────────────────────────────

export function StatsAnnualPage() {
  const config       = useAppStore((s) => s.config);
  const activeMonth  = useAppStore((s) => s.activeMonth);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const navigate    = useNavigate();

  const [year, setYear] = useState(() => Number(activeMonth.split('-')[0]));
  const [monthDataList, setMonthDataList] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    Promise.all(
      months.map(async (month) => {
        const ym = ymOf(year, month);
        const txs = await localCache.getTransactions(ym);
        const income  = txs.filter((t) => t.entryKind === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = txs.filter((t) => t.entryKind === 'expense').reduce((s, t) => s + t.amount, 0);
        return { ym, month, income, expense, transactions: txs };
      }),
    ).then((list) => {
      setMonthDataList(list);
      setLoading(false);
    });
  }, [year, lastSyncedAt]);

  const annualIncome  = monthDataList.reduce((s, d) => s + d.income, 0);
  const annualExpense = monthDataList.reduce((s, d) => s + d.expense, 0);
  const annualSaving  = annualIncome - annualExpense;

  const maxBarValue = Math.max(1, ...monthDataList.map((d) => Math.max(d.income, d.expense)));

  // 카테고리별 연간 지출
  const allTxs = monthDataList.flatMap((d) => d.transactions);
  const catMap = new Map(config.categories.map((c) => [c.id, c]));
  const catGrouped = new Map<string, number>();
  for (const tx of allTxs.filter((t) => t.entryKind === 'expense')) {
    catGrouped.set(tx.categoryId, (catGrouped.get(tx.categoryId) ?? 0) + tx.amount);
  }
  const totalCatExpense = annualExpense || 1;
  const catStats: AnnualCategoryStat[] = Array.from(catGrouped.entries())
    .map(([catId, total]) => ({
      category: catMap.get(catId),
      total,
      percent: (total / totalCatExpense) * 100,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // 안전도 이력 — 각 달의 마지막 날을 today로 주입해야 올바른 기간 계산이 됨
  // (buildSafetyInput 내부의 remainingDays, periodStartStr 등이 today 기준이므로)
  const safetyList = monthDataList.map((d) => {
    const [sy, sm] = d.ym.split('-').map(Number);
    const monthEnd = new Date(sy, sm, 0); // 해당 달 말일 (Day 0 of next month = last day)
    const input = buildSafetyInput(d.transactions, config, monthEnd);
    const summary = calcSafetySummary(input);
    return {
      ym: d.ym, month: d.month,
      score: summary.safetyScore,
      level: summary.safetyLevel,
      hasData: d.transactions.length > 0,
    };
  });

  // 월별 저축
  const monthlySavings = monthDataList.map((d) => d.income - d.expense);
  const activeMonthSavings = monthlySavings.filter((_, i) => monthDataList[i].transactions.length > 0);
  const avgSaving = activeMonthSavings.length > 0
    ? Math.round(activeMonthSavings.reduce((a, b) => a + b, 0) / activeMonthSavings.length)
    : 0;

  const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

  const hoveredData = hoveredMonth !== null ? monthDataList[hoveredMonth - 1] : null;

  return (
    <div className={styles.page}>
      {/* ── 상단 헤더 ── */}
      <div className={styles.topBar}>
        <div className={styles.yearNav}>
          <button className={styles.yearBtn} onClick={() => setYear(year - 1)} aria-label="이전 연도">←</button>
          <span className={styles.yearLabel}>{year}년</span>
          <button className={styles.yearBtn} onClick={() => setYear(year + 1)} aria-label="다음 연도">→</button>
        </div>

        <div className={styles.annualSummary}>
          <div className={styles.annualChip}>
            <span className={styles.annualChipLabel}>연간 수입</span>
            <span className={styles.annualChipVal} style={{ color: 'var(--income)' }}>{fmtShort(annualIncome)}</span>
          </div>
          <div className={styles.annualChip}>
            <span className={styles.annualChipLabel}>연간 지출</span>
            <span className={styles.annualChipVal} style={{ color: 'var(--expense)' }}>{fmtShort(annualExpense)}</span>
          </div>
          <div className={styles.annualChip}>
            <span className={styles.annualChipLabel}>연간 순계</span>
            <span className={styles.annualChipVal} style={{ color: annualSaving >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {annualSaving >= 0 ? '+' : ''}{fmtShort(annualSaving)}
            </span>
          </div>
          <div className={styles.annualChip}>
            <span className={styles.annualChipLabel}>월 평균 저축</span>
            <span className={styles.annualChipVal}>{fmtShort(avgSaving)}</span>
          </div>
        </div>
      </div>

      {/* ── 메인 그리드 ── */}
      <div className={styles.mainGrid}>

        {/* ── 왼쪽: 바 차트 ── */}
        <div className={styles.leftCol}>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>월별 수입 / 지출</span>

            {loading ? (
              <p className={styles.loadingText}>불러오는 중…</p>
            ) : (
              <>
                {/* 호버 정보 */}
                {hoveredData && (
                  <div className={styles.hoverInfo}>
                    <span className={styles.hoverMonth}>{MONTH_LABELS[hoveredData.month - 1]}</span>
                    <span style={{ color: 'var(--income)' }}>수입 {fmt(hoveredData.income)}</span>
                    <span style={{ color: 'var(--expense)' }}>지출 {fmt(hoveredData.expense)}</span>
                    <span style={{ color: hoveredData.income - hoveredData.expense >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                      순계 {hoveredData.income - hoveredData.expense >= 0 ? '+' : ''}{fmt(hoveredData.income - hoveredData.expense)}
                    </span>
                  </div>
                )}

                <div className={styles.barChart}>
                  {monthDataList.map((d) => {
                    const incomeH = maxBarValue > 0 ? (d.income / maxBarValue) * 100 : 0;
                    const expenseH = maxBarValue > 0 ? (d.expense / maxBarValue) * 100 : 0;
                    const isHovered = hoveredMonth === d.month;
                    return (
                      <button
                        key={d.ym}
                        className={`${styles.barColumn} ${isHovered ? styles.barColumnHovered : ''}`}
                        onClick={() => navigate(ROUTES.statsMonthly)}
                        onMouseEnter={() => setHoveredMonth(d.month)}
                        onMouseLeave={() => setHoveredMonth(null)}
                        type="button"
                        title={`${d.ym}`}
                      >
                        <div className={styles.barPair}>
                          <div className={styles.barIncome} style={{ height: `${incomeH}%` }} />
                          <div className={styles.barExpense} style={{ height: `${expenseH}%` }} />
                        </div>
                        {d.expense > 0 && (
                          <span className={styles.barValue}>{fmtShort(d.expense)}</span>
                        )}
                        <span className={styles.barLabel}>{MONTH_LABELS[d.month - 1]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* 범례 */}
                <div className={styles.chartLegend}>
                  <span className={styles.legendIncome}>■ 수입</span>
                  <span className={styles.legendExpense}>■ 지출</span>
                </div>
              </>
            )}
          </div>

          {/* 월별 저축 히트맵 */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>월별 순계</span>
            <div className={styles.savingGrid}>
              {monthDataList.map((d) => {
                const saving = d.income - d.expense;
                const hasData = d.transactions.length > 0;
                return (
                  <div key={d.ym} className={styles.savingCell}>
                    <span className={styles.savingMonth}>{d.month}월</span>
                    {hasData ? (
                      <span
                        className={styles.savingVal}
                        style={{ color: saving >= 0 ? 'var(--income)' : 'var(--expense)' }}
                      >
                        {saving >= 0 ? '+' : ''}{fmtShort(saving)}
                      </span>
                    ) : (
                      <span className={styles.savingEmpty}>—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 오른쪽: 카테고리 + 안전도 이력 ── */}
        <div className={styles.rightCol}>

          {/* 카테고리 순위 */}
          {catStats.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionTitle}>카테고리별 지출 순위</span>
              <div className={styles.catRankList}>
                {catStats.map((stat, i) => (
                  <div key={i} className={styles.catRankItem}>
                    <span className={styles.catRankNum}>{i + 1}</span>
                    <span className={styles.catRankIcon}>{stat.category?.icon ?? '📦'}</span>
                    <span className={styles.catRankName}>{stat.category?.name ?? '미분류'}</span>
                    <div className={styles.catRankBarTrack}>
                      <div className={styles.catRankBarFill} style={{ width: `${stat.percent}%` }} />
                    </div>
                    <span className={styles.catRankPct}>{stat.percent.toFixed(0)}%</span>
                    <span className={styles.catRankAmount}>{fmt(stat.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 안전도 이력 */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>월별 안전도 이력</span>
            <div className={styles.safetyGrid}>
              {safetyList.map((s) => (
                <div
                  key={s.ym}
                  className={styles.safetyCell}
                  style={s.hasData ? { borderColor: safetyColor(s.level) } : undefined}
                >
                  <span className={styles.safetyCellMonth}>{s.month}월</span>
                  {s.hasData ? (
                    <>
                      <span
                        className={styles.safetyCellScore}
                        style={{ color: safetyColor(s.level) }}
                      >
                        {Math.round(s.score)}
                      </span>
                      <span
                        className={styles.safetyCellLevel}
                        style={{ color: safetyColor(s.level) }}
                      >
                        {safetyLabel(s.level)}
                      </span>
                    </>
                  ) : (
                    <span className={styles.safetyCellEmpty}>—</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 연간 통계 */}
          <div className={styles.section}>
            <span className={styles.sectionTitle}>연간 통계</span>
            <div className={styles.annualStatsGrid}>
              <div className={styles.annualStatCard}>
                <span className={styles.annualStatLabel}>총 거래건수</span>
                <span className={styles.annualStatVal}>{allTxs.length}건</span>
              </div>
              <div className={styles.annualStatCard}>
                <span className={styles.annualStatLabel}>지출 거래</span>
                <span className={styles.annualStatVal}>{allTxs.filter(t=>t.entryKind==='expense').length}건</span>
              </div>
              <div className={styles.annualStatCard}>
                <span className={styles.annualStatLabel}>월 평균 지출</span>
                <span className={styles.annualStatVal}>{fmtShort(Math.round(annualExpense / 12))}</span>
              </div>
              <div className={styles.annualStatCard}>
                <span className={styles.annualStatLabel}>월 평균 수입</span>
                <span className={styles.annualStatVal}>{fmtShort(Math.round(annualIncome / 12))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
