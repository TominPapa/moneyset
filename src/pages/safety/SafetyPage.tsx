// SafetyPage — Design System V2
// Editorial hero + metric cards + budget structure bars

import { useState, useEffect } from 'react';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { calcSafetySummary } from '../../domain/safety';
import { buildSafetyInput } from '../../domain/safetyUtils';
import type { Transaction, SafetySummary } from '../../domain/types';
import {
  IcBudget, IcWallet, IcSparkle, IcShield, IcCalendar, IcTrending,
  IcCheck, IcDownload, IcChevronLeft, IcChevronRight, IcInfo,
} from '../../components/ui/Icons';
import styles from './SafetyPage.module.css';

// ─── utils ────────────────────────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString('ko-KR') + '원'; }
function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10_000) return (n / 10_000).toFixed(0) + '만';
  return n.toLocaleString('ko-KR');
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
  const m: Record<string,string> = {
    very_safe: 'var(--safe-1)', safe: 'var(--safe-2)',
    warning: 'var(--safe-3)', risk: 'var(--safe-4)', critical: 'var(--safe-5)',
  };
  return m[level] ?? 'var(--text-2)';
}
function safetyLabel(level: string): string {
  const m: Record<string,string> = {
    very_safe: '매우 안전', safe: '안전', warning: '주의', risk: '위험', critical: '위기',
  };
  return m[level] ?? level;
}
function safetyHero(level: string): string {
  const m: Record<string,string> = {
    very_safe: '이번 달, 당신은\n수입보다 덜 쓰고 있어요.',
    safe:      '이번 달 예산을\n안정적으로 관리 중이에요.',
    warning:   '지출 속도가 조금\n빠릅니다. 주의하세요.',
    risk:      '예산 초과 위험이\n있습니다. 지출을 줄이세요.',
    critical:  '예산을 초과했거나\n초과 직전입니다.',
  };
  return m[level] ?? '';
}
function formatScore(s: number): string { return s >= 200 ? '200' : s <= 0 ? '0' : String(Math.round(s)); }
function formatScoreSuffix(s: number): string { return s >= 200 ? '+' : ''; }

// ─── SafetyPage ───────────────────────────────────────────────────────────────

export function SafetyPage() {
  const config      = useAppStore(s => s.config);
  const activeMonth = useAppStore(s => s.activeMonth);
  const setActiveMonth = useAppStore(s => s.setActiveMonth);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  useEffect(() => { localCache.getTransactions(activeMonth).then(setTransactions); }, [activeMonth]);

  const safetyInput    = buildSafetyInput(transactions, config);
  const summary: SafetySummary = calcSafetySummary(safetyInput);
  const levelColor     = safetyColor(summary.safetyLevel);
  const scoreNum       = summary.safetyScore;
  const activeFixed    = config.fixedExpenses.filter(r => r.isActive);
  const fixedTotal     = activeFixed.reduce((s,r) => s+r.amount, 0);

  const usedRatio = summary.monthlyBudgetBase > 0
    ? Math.min(1, summary.livingSpentSoFar / summary.monthlyBudgetBase) : 0;
  const weeklySpent = safetyInput.weeklyLivingSpent;

  // Category top 5
  const catSpendMap = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.entryKind !== 'expense') continue;
    catSpendMap.set(tx.categoryId, (catSpendMap.get(tx.categoryId) ?? 0) + tx.amount);
  }

  // Ring SVG
  const size = 260; const stroke = 16;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, scoreNum / 200));
  const off = C * (1 - pct);

  // Budget structure bars
  const income = config.expectedNetIncomeDefault || 1;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.subtitle}>FINANCIAL SAFETY</div>
          <div className={styles.title}>재무 안전도</div>
        </div>
        <div className={styles.monthNav}>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(prevYM(activeMonth))} type="button"><IcChevronLeft size={16}/></button>
          <span className={styles.monthLabel}>{activeMonth.replace('-','.')}</span>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(nextYM(activeMonth))} type="button"><IcChevronRight size={16}/></button>
        </div>
        <div className={styles.topActions}>
          <button className={styles.actionBtn} type="button"><IcDownload size={14}/> 리포트</button>
          <button className={styles.actionBtn} type="button"><IcSparkle size={14}/> 개선 제안</button>
        </div>
      </div>

      <div className={styles.scroll}>

        {/* ── Hero card ── */}
        <div className={styles.heroCard}>
          <div className={styles.heroGrid}>
            {/* Ring */}
            <div>
              <div style={{ position: 'relative', width: size, height: size }}>
                <svg width={size} height={size}>
                  <circle cx={size/2} cy={size/2} r={r} fill="none"
                    strokeWidth={stroke} stroke="rgba(255,255,255,0.06)"/>
                  <circle cx={size/2} cy={size/2} r={r} fill="none"
                    strokeWidth={stroke} stroke={levelColor}
                    strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off}
                    transform={`rotate(-90 ${size/2} ${size/2})`}
                    style={{ filter: `drop-shadow(0 0 14px ${levelColor}60)`, transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div className={styles.ringInner}>
                  <div className={styles.ringScore} style={{ color: levelColor }}>
                    {formatScore(scoreNum)}<span className={styles.ringScoreSuffix} style={{ color: levelColor }}>{formatScoreSuffix(scoreNum)}</span>
                  </div>
                  <div className={styles.ringLevel} style={{ color: levelColor }}>{safetyLabel(summary.safetyLevel)}</div>
                </div>
              </div>
            </div>

            {/* Hero info */}
            <div className={styles.heroInfo}>
              <div className={styles.heroOverline} style={{ color: levelColor }}>
                SAFETY SCORE · 상위 3%
              </div>
              <h1 className={styles.heroHeadline}>
                {safetyHero(summary.safetyLevel).split('\n').map((line, i) => (
                  <span key={i}>
                    {i === 1 ? <span style={{ color: levelColor }}>{line}</span> : line}
                    {i === 0 && <br/>}
                  </span>
                ))}
              </h1>
              <p className={styles.heroDesc}>
                고정지출 대비 현재 잔액은 <b>{Math.max(0, Math.floor(summary.monthlySpendableRemaining / Math.max(1, fixedTotal)))}개월</b>을 버틸 수 있어요.
              </p>

              {/* Pills */}
              <div className={styles.heroPills}>
                <span className={styles.pillMint}><IcCheck size={12}/> 예산 페이스 {summary.safetyLevel === 'very_safe' || summary.safetyLevel === 'safe' ? '양호' : '주의'}</span>
                <span className={styles.pillMint}><IcCheck size={12}/> 비상금 {Math.floor(summary.monthlySpendableRemaining / Math.max(1, fixedTotal)) >= 3 ? '충분' : '부족'}</span>
                {summary.weeklyOverspendRatio > 1.1 && (
                  <span className={styles.pillGold}><IcSparkle size={12}/> 주간 속도 주의</span>
                )}
              </div>

              {/* Safety band */}
              <div className={styles.safeBand}>
                {(['위기','위험','주의','안전','매우 안전'] as const).map((t, i) => {
                  const levelIndex = ['critical','risk','warning','safe','very_safe'].indexOf(summary.safetyLevel);
                  const isActive = i === levelIndex;
                  return (
                    <div key={t} className={`${styles.safeBandItem} ${isActive ? styles.safeBandItemActive : ''}`}
                      style={{ flex: i === 4 ? 1.5 : 1 }}>
                      <div style={{ fontSize: 10, color: isActive ? 'var(--mint-300)' : 'var(--text-2)' }}>{t}</div>
                      <div className={styles.safeBandScore} style={{ color: isActive ? 'var(--mint-300)' : 'var(--text-2)' }}>
                        {['~0','~50','~100','~150','150+'][i]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Metric cards 3×2 ── */}
        <div className={styles.metricsGrid}>
          {[
            { label: '월 예산 기준',          value: fmt(summary.monthlyBudgetBase),             unit: '', hint: '이번 달 설정',          Icon: IcBudget,    color: 'var(--mint-500)' },
            { label: '이번 달 생활비 지출',    value: fmt(summary.livingSpentSoFar),             unit: '', hint: `${Math.round(usedRatio*100)}% 소진`,  Icon: IcWallet,    color: 'var(--mint-500)' },
            { label: '남은 생활비',            value: fmt(Math.max(0, summary.monthlySpendableRemaining)), unit: '', hint: summary.monthlySpendableRemaining < 0 ? '예산 초과' : '잔여 예산', Icon: IcSparkle, color: 'var(--gold-500)' },
            { label: '이번 주 권장 한도',      value: fmt(Math.max(0, Math.round(summary.weeklyRecommendedLimit))), unit: '', hint: '정상 범위', Icon: IcShield, color: 'var(--mint-500)' },
            { label: '오늘 권장 한도',         value: fmt(Math.max(0, Math.round(summary.dailyRecommendedLimit))),  unit: '', hint: '내일까지 유효', Icon: IcCalendar, color: 'var(--mint-500)' },
            { label: '주간 초과 비율',         value: `${Math.min(999, Math.round(summary.weeklyOverspendRatio * 100))}`, unit: '%', hint: summary.weeklyOverspendRatio <= 1 ? '정상' : '주의 필요', Icon: IcTrending, color: 'var(--mint-500)' },
          ].map((s, i) => (
            <div key={i} className={styles.metricCard}>
              <div className={styles.metricCardHeader}>
                <div className={styles.metricLabel}>{s.label}</div>
                <div className={styles.metricIcon} style={{ background: `${s.color}22`, color: s.color }}>
                  <s.Icon size={16}/>
                </div>
              </div>
              <div className={styles.metricValue}>
                {s.value}<span className={styles.metricUnit}>{s.unit}</span>
              </div>
              <div className={styles.metricHint}>{s.hint}</div>
            </div>
          ))}
        </div>

        {/* ── Bottom row ── */}
        <div className={styles.bottomRow}>

          {/* Budget structure */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.subtitle}>예산 구조 · 수입 대비 할당</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                  월 순수입 {fmt(income)} 기준
                </div>
              </div>
              <span className={styles.pillMint}>건강한 비율</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
              {[
                { label: '월 순수입', val: income, pct: 100, color: 'var(--mint-500)' },
                { label: '고정지출', val: fixedTotal, pct: income > 0 ? Math.round(fixedTotal/income*100) : 0, color: 'var(--gold-500)' },
                { label: '생활비 예산', val: summary.monthlyBudgetBase, pct: income > 0 ? Math.round(summary.monthlyBudgetBase/income*100) : 0, color: 'var(--mint-300)' },
                { label: '실제 지출', val: summary.livingSpentSoFar, pct: summary.monthlyBudgetBase > 0 ? Math.round(summary.livingSpentSoFar/summary.monthlyBudgetBase*100) : 0, color: levelColor },
              ].map((r, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{r.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-0)', fontWeight: 600 }}>
                      {fmt(r.val)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· {r.pct}%</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, r.pct)}%`, background: r.color, borderRadius: 3, transition: 'width 0.6s ease' }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly status */}
          <div className={styles.card}>
            <div className={styles.subtitle} style={{ marginBottom: 14 }}>이번 주 현황</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>이번 주 지출</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, marginTop: 2 }}>
                  {fmtShort(weeklySpent)}<span style={{ fontSize: 12, color: 'var(--text-2)' }}>원</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)' }}>이번 주 권장</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, marginTop: 2, color: levelColor }}>
                  {fmtShort(Math.max(0, Math.round(summary.weeklyRecommendedLimit)))}<span style={{ fontSize: 12, color: 'var(--text-2)' }}>원</span>
                </div>
              </div>
            </div>
            {/* Status chip */}
            <div style={{ padding: 14, background: 'var(--bg-3)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: weeklySpent <= summary.weeklyRecommendedLimit ? 'rgba(63,214,164,0.15)' : 'rgba(244,114,114,0.15)', color: weeklySpent <= summary.weeklyRecommendedLimit ? 'var(--mint-300)' : 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {weeklySpent <= summary.weeklyRecommendedLimit ? <IcCheck size={18}/> : <IcSparkle size={18}/>}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {weeklySpent <= summary.weeklyRecommendedLimit ? '초과 없이 정상 진행' : '주간 예산 초과'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                  주간 예산의 {summary.weeklyRecommendedLimit > 0 ? Math.round(weeklySpent/summary.weeklyRecommendedLimit*100) : 0}% 사용
                </div>
              </div>
            </div>

            {/* Fixed cover analysis */}
            <div style={{ marginTop: 20 }}>
              <div className={styles.subtitle} style={{ marginBottom: 12 }}>고정지출 커버 분석</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: 12 }).map((_, i) => {
                  const monthsCover = fixedTotal > 0 ? Math.floor(summary.monthlySpendableRemaining / fixedTotal) : 0;
                  const isCovered = i < Math.min(monthsCover, 12);
                  const isSoon    = i >= Math.min(monthsCover, 12) && i < Math.min(monthsCover + 2, 12);
                  return (
                    <div key={i} style={{ flex: 1, height: 40, borderRadius: 6, position: 'relative',
                      background: isCovered ? 'var(--mint-500)' : isSoon ? 'rgba(63,214,164,0.2)' : 'var(--bg-3)',
                      border: '1px solid var(--line)',
                    }}>
                      <div style={{ position: 'absolute', bottom: -16, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: 'var(--text-3)' }}>{i+1}M</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 28, padding: 12, background: 'var(--bg-3)', borderRadius: 10, fontSize: 13, color: 'var(--text-1)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <IcInfo size={16}/> 일반적으로 <b style={{ color: 'var(--mint-300)' }}>3개월 이상</b>을 권장합니다.
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
