// DebtPage — 부채 관리 (전면 재구성)

import { useState } from 'react';
import { useAppStore } from '../../app/store/appStore';
import type { Liability, Account } from '../../domain/types';
import styles from './DebtPage.module.css';

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString('ko-KR') + '원'; }
function fmtShort(n: number): string {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '억';
  if (n >= 10_000) return (n / 10_000).toFixed(0) + '만';
  return n.toLocaleString('ko-KR');
}

const LIABILITY_KIND_LABELS: Record<string, string> = {
  loan: '대출',
  installment: '할부',
  rent: '월세',
  credit_card_recurring: '카드대금',
};

const LIABILITY_KIND_COLORS: Record<string, string> = {
  loan: '#F47272',
  installment: '#D9B26A',
  rent: '#9DB6F0',
  credit_card_recurring: '#C9A6F0',
};

function effectiveMonths(item: Liability): number {
  if (item.remainingMonths && item.remainingMonths > 0) return item.remainingMonths;
  if (item.totalBalance && item.monthlyAmount > 0) return Math.ceil(item.totalBalance / item.monthlyAmount);
  return 0;
}

function effectivePayoffDate(item: Liability): string {
  const months = effectiveMonths(item);
  if (months <= 0) return '—';
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function calcScore(totalDebt: number, totalAssets: number): number {
  if (totalDebt === 0) return 100;
  if (totalAssets === 0) return 5;
  const ratio = totalDebt / totalAssets;
  return Math.max(5, Math.min(95, Math.round(100 - 95 * Math.min(1, ratio / 3))));
}

function scoreLevel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: '건강', color: '#3FD6A4' };
  if (score >= 65) return { label: '양호', color: '#7FC8D6' };
  if (score >= 45) return { label: '주의', color: '#E8B86A' };
  if (score >= 25) return { label: '위험', color: '#F47272' };
  return { label: '심각', color: '#FF3B3B' };
}

// ─── 잠금 오버레이 ─────────────────────────────────────────────────────────────

function LockedSection({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className={styles.lockedSection}>
      <div className={styles.lockedBlur} />
      <div className={styles.lockedContent}>
        <div className={styles.lockedIcon}>✦</div>
        <div className={styles.lockedTitle}>후원자 전용 기능</div>
        <div className={styles.lockedDesc}>
          부채 비율 분석은<br />
          텀블벅 후원자에게 제공되는 기능입니다.
        </div>
        <button className={styles.lockedBtn} type="button" onClick={onUnlock}>
          후원자 코드 입력하기
        </button>
      </div>
    </div>
  );
}

// ─── DebtHealthGauge ──────────────────────────────────────────────────────────

function DebtHealthGauge({ score }: { score: number }) {
  const size = 200;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circumference = Math.PI * r;
  const dashoff = circumference * (1 - score / 100);
  const { label, color } = scoreLevel(score);

  return (
    <div className={styles.gaugeWrap}>
      <svg width={size} height={size / 2 + 30}>
        <defs>
          <linearGradient id="debtGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F47272" />
            <stop offset="50%" stopColor="#E8B86A" />
            <stop offset="100%" stopColor="#3FD6A4" />
          </linearGradient>
        </defs>
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="url(#debtGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoff}
        />
      </svg>
      <div className={styles.gaugeCenter}>
        <div className={styles.gaugeScore} style={{ color }}>
          {score}<span className={styles.gaugeScoreMax}>/100</span>
        </div>
        <div className={styles.gaugeLabel} style={{ color }}>{label}</div>
      </div>
      <div className={styles.gaugeAxis}>
        <span>심각</span><span>주의</span><span>건강</span>
      </div>
      <div className={styles.gaugeHint}>숫자가 높을수록 부채 건강도가 좋습니다</div>
    </div>
  );
}

// ─── NextPayments ──────────────────────────────────────────────────────────────

function NextPayments({ liabilities }: { liabilities: Liability[] }) {
  const active = liabilities.filter(l => l.isActive);
  if (active.length === 0) {
    return <div className={styles.nextEmpty}>납부 일정 없음</div>;
  }

  const today = new Date().getDate();
  const sorted = [...active].sort((a, b) => {
    // 오늘 이후 날짜 우선, 그 다음 날짜 순
    const aAfter = a.dueDay >= today;
    const bAfter = b.dueDay >= today;
    if (aAfter && !bAfter) return -1;
    if (!aAfter && bAfter) return 1;
    return a.dueDay - b.dueDay;
  }).slice(0, 3);

  return (
    <div className={styles.nextList}>
      {sorted.map(item => {
        const color = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
        const isPast = item.dueDay < today;
        return (
          <div key={item.id} className={styles.nextItem} style={{ borderLeftColor: color }}>
            <div className={styles.nextDay}>
              <div className={styles.nextDayNum} style={{ color: isPast ? 'var(--text-3)' : color }}>{item.dueDay}</div>
              <div className={styles.nextDayLabel}>일</div>
            </div>
            <div className={styles.nextDivider} />
            <div className={styles.nextName}>{item.name}</div>
            <div className={styles.nextAmount}>{fmtShort(item.monthlyAmount)}원</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, unit, hint, color }: {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  color?: string;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue} style={{ color: color ?? 'var(--text-0)' }}>
        {value}{unit && <span className={styles.kpiUnit}>{unit}</span>}
      </div>
      <div className={styles.kpiHint}>{hint}</div>
    </div>
  );
}

// ─── DebtCard ─────────────────────────────────────────────────────────────────

function DebtCard({ item }: { item: Liability }) {
  const color = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
  const months = effectiveMonths(item);
  const years = months > 0 ? Math.floor(months / 12) : 0;
  const remMonths = months > 0 ? months % 12 : 0;
  const durationLabel = months > 0
    ? (years > 0 ? `${years}년 ${remMonths > 0 ? remMonths + '개월' : ''}`.trim() : `${months}개월`)
    : '—';

  return (
    <div className={styles.debtCard}>
      <div className={styles.debtCardTop}>
        <div className={styles.debtCardLeft}>
          <span className={styles.debtCardName}>{item.name}</span>
          <span
            className={styles.debtKindBadge}
            style={{ color, borderColor: `${color}44`, background: `${color}11` }}
          >
            {LIABILITY_KIND_LABELS[item.kind] ?? item.kind}
          </span>
        </div>
        <div className={styles.debtCardMonthly}>
          <span className={styles.debtCardMonthlyLabel}>월납입</span>
          <span className={styles.debtCardMonthlyValue} style={{ color }}>
            {fmtShort(item.monthlyAmount)}원
          </span>
        </div>
      </div>
      <div className={styles.debtCardGrid}>
        <div className={styles.debtCardStat}>
          <div className={styles.debtCardStatLabel}>잔여원금</div>
          <div className={styles.debtCardStatValue}>
            {item.totalBalance ? fmtShort(item.totalBalance) + '원' : '—'}
          </div>
        </div>
        <div className={styles.debtCardStat}>
          <div className={styles.debtCardStatLabel}>남은기간</div>
          <div className={styles.debtCardStatValue}>{durationLabel}</div>
        </div>
        <div className={styles.debtCardStat}>
          <div className={styles.debtCardStatLabel}>납부일</div>
          <div className={styles.debtCardStatValue}>매월 {item.dueDay}일</div>
        </div>
      </div>
      {months > 0 && (
        <div className={styles.debtCardPayoff}>
          {effectivePayoffDate(item)} 완납 예정
          {!item.remainingMonths && <span className={styles.debtCardEstimate}> (추정)</span>}
        </div>
      )}
    </div>
  );
}

// ─── DebtDonut ────────────────────────────────────────────────────────────────

function DebtDonut({ liabilities }: { liabilities: Liability[] }) {
  const items = liabilities.filter(l => l.isActive && l.totalBalance && l.totalBalance > 0);
  const total = items.reduce((s, l) => s + (l.totalBalance ?? 0), 0);

  if (items.length === 0 || total === 0) {
    return <div className={styles.donutEmpty}>잔여원금 데이터 없음</div>;
  }

  const cx = 80, cy = 80, r = 60, strokeW = 22;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = items.map((item, i) => {
    const pct = (item.totalBalance ?? 0) / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const color = LIABILITY_KIND_COLORS[item.kind] ?? `hsl(${i * 60}, 60%, 60%)`;
    const slice = { item, pct, dash, gap, offset, color };
    offset += dash;
    return slice;
  });

  return (
    <div className={styles.donutWrap}>
      <div className={styles.donutChart}>
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeW} />
          {slices.map(({ item, dash, gap, offset: off, color }) => (
            <circle
              key={item.id}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={circumference / 4 - off}
              strokeLinecap="butt"
            />
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-3)" fontSize="9">총부채</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--text-0)" fontSize="13" fontWeight="700">
            {fmtShort(total)}원
          </text>
        </svg>
      </div>
      <div className={styles.donutLegend}>
        {slices.map(({ item, pct, color }) => (
          <div key={item.id} className={styles.donutLegendItem}>
            <span className={styles.donutLegendDot} style={{ background: color }} />
            <span className={styles.donutLegendName}>{item.name}</span>
            <span className={styles.donutLegendPct}>{Math.round(pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PayoffChart (스택 영역 차트 SVG) ────────────────────────────────────────

function fmtAmt(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
  return '0';
}

function PayoffChart({ liabilities }: { liabilities: Liability[] }) {
  const items = liabilities.filter(l => l.isActive && effectiveMonths(l) > 0);
  if (items.length === 0) {
    return <div className={styles.chartEmpty}>상환 기간 데이터가 없습니다.</div>;
  }

  const maxMonths = Math.max(...items.map(l => effectiveMonths(l)));
  const W = 640, H = 220, padL = 54, padR = 12, padT = 20, padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const steps = Math.min(maxMonths, 120);
  const months = Array.from({ length: steps + 1 }, (_, i) => i);

  function balanceAt(item: Liability, m: number): number {
    const em = effectiveMonths(item);
    if (em <= 0) return 0;
    const b = item.totalBalance ?? item.monthlyAmount * em;
    return Math.max(0, b - (b / em) * m);
  }

  const stackData = months.map(m => {
    let cum = 0;
    return items.map(item => {
      const b = balanceAt(item, m);
      const prev = cum;
      cum += b;
      return { prev, curr: cum };
    });
  });

  const maxY = stackData[0][items.length - 1]?.curr ?? 1;

  function xPos(m: number) { return padL + (m / steps) * chartW; }
  function yPos(v: number) { return padT + chartH - (v / maxY) * chartH; }

  function buildArea(itemIdx: number): string {
    const topPts = months.map(m => `${xPos(m)},${yPos(stackData[m][itemIdx].curr)}`);
    const botPts = [...months].reverse().map(m => `${xPos(m)},${yPos(stackData[m][itemIdx].prev)}`);
    return `M ${topPts[0]} L ${topPts.join(' L ')} L ${botPts.join(' L ')} Z`;
  }

  // Y축 기준선 (0%, 25%, 50%, 75%, 100%)
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  // X축 레이블
  const xLabels: { m: number; label: string }[] = [];
  const labelStep = maxMonths > 60 ? 12 : maxMonths > 24 ? 6 : 3;
  for (let m = labelStep; m <= steps; m += labelStep) {
    xLabels.push({ m: Math.min(m, steps), label: m >= 12 ? `${Math.round(m / 12)}년` : `${m}개월` });
  }

  // 완납 마일스톤 (steps 이내만)
  const milestones = items
    .map(item => ({ item, em: effectiveMonths(item) }))
    .filter(({ em }) => em > 0 && em <= steps)
    .sort((a, b) => a.em - b.em);

  return (
    <div className={styles.chartWrap}>
      {/* 범례 — HTML로 분리 */}
      <div className={styles.chartLegend}>
        {items.map(item => {
          const color = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
          const em = effectiveMonths(item);
          const payoffLabel = em > steps ? `${Math.round(em / 12)}년 후 완납` : em >= 12 ? `${Math.round(em / 12)}년 후 완납` : `${em}개월 후 완납`;
          return (
            <div key={item.id} className={styles.chartLegendItem}>
              <span className={styles.chartLegendDot} style={{ background: color }} />
              <span className={styles.chartLegendName}>{item.name}</span>
              <span className={styles.chartLegendSub}>{payoffLabel}</span>
            </div>
          );
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className={styles.chartSvg}>
        <defs>
          {items.map((item, i) => {
            const color = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
            return (
              <linearGradient key={item.id} id={`areaGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.65" />
                <stop offset="100%" stopColor={color} stopOpacity="0.12" />
              </linearGradient>
            );
          })}
        </defs>

        {/* Y축 그리드 + 레이블 */}
        {yTicks.map((pct, i) => {
          const v = maxY * pct;
          const y = yPos(v);
          return (
            <g key={i}>
              <line
                x1={padL} y1={y} x2={padL + chartW} y2={y}
                stroke="var(--line)" strokeWidth={i === 0 ? 1 : 0.5}
                strokeDasharray={pct === 1.0 ? 'none' : '4,4'}
              />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="var(--text-3)" fontSize="9">
                {pct === 0 ? '0' : fmtAmt(v)}
              </text>
            </g>
          );
        })}

        {/* 영역 */}
        {items.map((item, i) => {
          const color = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
          return (
            <path key={item.id} d={buildArea(i)}
              fill={`url(#areaGrad${i})`} stroke={color} strokeWidth="1.2" strokeOpacity="0.5" />
          );
        })}

        {/* X축 */}
        <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="var(--line-strong)" strokeWidth="1" />
        {xLabels.map(({ m, label }) => (
          <text key={m} x={xPos(m)} y={H - 8} textAnchor="middle" fill="var(--text-3)" fontSize="9">{label}</text>
        ))}

        {/* 완납 마일스톤 */}
        {milestones.map(({ item, em }) => {
          const color = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
          const x = xPos(em);
          const itemIdx = items.indexOf(item);
          const stackAtEm = stackData[em];
          const dotY = stackAtEm ? yPos(stackAtEm[itemIdx].prev) : padT + chartH;
          const remainAfter = stackAtEm ? stackAtEm[items.length - 1].curr : 0;
          return (
            <g key={item.id}>
              {/* 수직 점선 */}
              <line x1={x} y1={padT} x2={x} y2={padT + chartH}
                stroke={color} strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.6" />
              {/* 완납 점 */}
              <circle cx={x} cy={dotY} r="5" fill={color} />
              <circle cx={x} cy={dotY} r="3" fill="var(--bg-2)" />
              <circle cx={x} cy={dotY} r="1.5" fill={color} />
              {/* 잔여 금액 라벨 */}
              <text x={x} y={padT + chartH + 20} textAnchor="middle" fill={color} fontSize="8" fontWeight="600">
                {remainAfter > 0 ? `↓${fmtAmt(remainAfter)}` : '완납!'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── DebtRatioGauge (supporter) ───────────────────────────────────────────────

function DebtRatioGauge({ liabilities, accounts }: {
  liabilities: Liability[];
  accounts: Account[];
}) {
  const totalDebt = liabilities.filter(l => l.isActive && l.totalBalance).reduce((s, l) => s + (l.totalBalance ?? 0), 0);
  const totalAssets = accounts.filter(a => a.isActive).reduce((s, a) => s + a.balance, 0);
  const ratio = totalAssets > 0 ? Math.min(100, Math.round((totalDebt / totalAssets) * 100)) : 0;
  const isHealthy = ratio < 30;
  const isWarning = ratio >= 30 && ratio < 60;

  const gaugeColor = isHealthy ? 'var(--mint-500)' : isWarning ? 'var(--gold-500)' : '#F47272';
  const gaugeLabel = isHealthy ? '건강' : isWarning ? '주의' : '위험';

  const dotAngle = ((180 - 180 * (ratio / 100)) * Math.PI) / 180;
  const dotX = 90 + 80 * Math.cos(dotAngle);
  const dotY = 90 - 80 * Math.sin(dotAngle);

  return (
    <div className={styles.ratioCard}>
      <div className={styles.ratioGaugeWrap}>
        <svg width="180" height="100" viewBox="0 0 180 100">
          <defs>
            <filter id="gaugeDot" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path d="M 10 90 A 80 80 0 0 1 170 90" fill="none" stroke="var(--bg-0)" strokeWidth="12" strokeLinecap="round" />
          <path d="M 10 90 A 80 80 0 0 1 170 90" fill="none" stroke={gaugeColor}
            strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(ratio / 100) * 251.2} 251.2`}
          />
          {ratio > 0 && (
            <circle cx={dotX} cy={dotY} r="8" fill={gaugeColor} filter="url(#gaugeDot)" />
          )}
          <text x="90" y="76" textAnchor="middle" fill={gaugeColor} fontSize="24" fontWeight="700">{ratio}%</text>
          <text x="90" y="91" textAnchor="middle" fill="var(--text-2)" fontSize="11">{gaugeLabel}</text>
        </svg>
      </div>
      <div className={styles.ratioStats}>
        <div className={styles.ratioStat}>
          <span className={styles.ratioStatLabel}>총 자산</span>
          <span className={styles.ratioStatValue} style={{ color: 'var(--mint-300)' }}>{fmt(totalAssets)}</span>
        </div>
        <div className={styles.ratioStat}>
          <span className={styles.ratioStatLabel}>총 부채</span>
          <span className={styles.ratioStatValue} style={{ color: '#F47272' }}>{fmt(totalDebt)}</span>
        </div>
        <div className={styles.ratioStat}>
          <span className={styles.ratioStatLabel}>순자산</span>
          <span className={styles.ratioStatValue} style={{ color: totalAssets - totalDebt >= 0 ? 'var(--text-0)' : '#F47272' }}>
            {totalAssets - totalDebt >= 0 ? '+' : ''}{fmt(totalAssets - totalDebt)}
          </span>
        </div>
      </div>
      <div className={styles.ratioHint}>
        {isHealthy ? '✓ 부채 비율이 건강한 수준입니다 (30% 미만)' :
          isWarning ? '⚠ 부채 비율이 높습니다. 상환 속도를 높이는 것을 권장합니다.' :
            '⛔ 부채가 자산의 60%를 초과했습니다. 즉시 관리가 필요합니다.'}
      </div>
    </div>
  );
}

// ─── DebtPage ─────────────────────────────────────────────────────────────────

type SortMode = 'amount' | 'dueDay' | 'payoff';

export function DebtPage() {
  const liabilities = useAppStore(s => s.liabilities);
  const accounts = useAppStore(s => s.accounts);
  const userTier = useAppStore(s => s.userTier);
  const isSupporter = userTier === 'supporter';
  const unlockSupporter = useAppStore(s => s.unlockSupporter);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('amount');

  const active = liabilities.filter(l => l.isActive);

  // KPI 계산
  const totalMonthly = active.reduce((s, l) => s + l.monthlyAmount, 0);
  const totalBalance = active.filter(l => l.totalBalance).reduce((s, l) => s + (l.totalBalance ?? 0), 0);
  const totalAssets = accounts.filter(a => a.isActive).reduce((s, a) => s + a.balance, 0);
  const score = calcScore(totalBalance, totalAssets);
  const { label: scoreLabel, color: scoreColor } = scoreLevel(score);

  // 완납까지 최장 기간
  const maxMonths = active.length > 0
    ? Math.max(0, ...active.map(l => effectiveMonths(l)))
    : 0;
  const maxYears = Math.floor(maxMonths / 12);
  const maxRemMonths = maxMonths % 12;
  const payoffLabel = maxMonths > 0
    ? (maxYears > 0 ? `${maxYears}년 ${maxRemMonths > 0 ? maxRemMonths + '개월' : ''}`.trim() : `${maxMonths}개월`)
    : '—';

  // 정렬된 부채 목록
  const sortedActive = [...active].sort((a, b) => {
    if (sortMode === 'amount') return (b.totalBalance ?? 0) - (a.totalBalance ?? 0);
    if (sortMode === 'dueDay') return a.dueDay - b.dueDay;
    if (sortMode === 'payoff') return effectiveMonths(a) - effectiveMonths(b);
    return 0;
  });

  // 부채/자산 비율 텍스트
  const debtRatioPct = totalAssets > 0 ? Math.round((totalBalance / totalAssets) * 100) : 0;
  const debtCount = active.length;

  async function handleUnlock() {
    setUnlocking(true);
    setUnlockError('');
    const ok = await unlockSupporter(unlockCode);
    setUnlocking(false);
    if (ok) {
      setShowUnlockModal(false);
      setUnlockCode('');
    } else {
      setUnlockError('코드가 올바르지 않습니다. 텀블벅 메시지를 확인해주세요.');
    }
  }

  return (
    <div className={styles.page}>

      {/* ── 상단 헤더 ── */}
      <div className={styles.topBar}>
        <div>
          <div className={styles.topSubtitle}>DEBT MANAGEMENT</div>
          <div className={styles.topTitle}>부채 관리</div>
        </div>
        {isSupporter && (
          <div className={styles.tierBadge}>✦ 후원자</div>
        )}
      </div>

      <div className={styles.scroll}>

        {/* ── Hero: 3열 그리드 ── */}
        <div className={styles.hero}>
          <DebtHealthGauge score={score} />

          <div className={styles.heroContent}>
            <div className={styles.heroSubtitle}>
              DEBT HEALTH · <span style={{ color: scoreColor }}>{scoreLabel} 구간</span>
            </div>
            <div className={styles.heroTitle}>
              {totalAssets > 0
                ? `부채가 자산의 ${debtRatioPct}%`
                : totalBalance > 0 ? '자산 정보 없음' : '부채 없음'}
            </div>
            <div className={styles.heroBadges}>
              <span className={styles.heroBadge} style={{ borderColor: `${scoreColor}44`, color: scoreColor, background: `${scoreColor}11` }}>
                {scoreLabel}
              </span>
              <span className={styles.heroBadge}>
                부채 {debtCount}건
              </span>
              {maxMonths > 0 && (
                <span className={styles.heroBadge}>
                  최장 {payoffLabel}
                </span>
              )}
            </div>
          </div>

          <div className={styles.heroPayments}>
            <div className={styles.sectionSmallTitle}>이번 달 납부 일정</div>
            <NextPayments liabilities={liabilities} />
          </div>
        </div>

        {/* ── KPI 3열 ── */}
        <div className={styles.kpiRow}>
          <KpiCard
            label="월 납입 합계"
            value={fmtShort(totalMonthly)}
            unit="원"
            hint="매월 고정 지출"
            color="#F47272"
          />
          <KpiCard
            label="총 잔여 원금"
            value={totalBalance > 0 ? fmtShort(totalBalance) : '—'}
            unit={totalBalance > 0 ? '원' : undefined}
            hint={`${active.length}건 활성 부채`}
          />
          <KpiCard
            label="완납까지"
            value={payoffLabel}
            hint={maxMonths > 0 ? effectivePayoffDate(active.reduce((a, b) => effectiveMonths(a) > effectiveMonths(b) ? a : b, active[0])) + ' 완납 예정' : '상환 기간 미설정'}
          />
        </div>

        {/* ── 메인 그리드: 1.7fr + 1fr ── */}
        <div className={styles.mainGrid}>

          {/* 왼쪽: 부채 목록 */}
          <div className={styles.mainLeft}>
            <div className={styles.section}>
              <div className={styles.debtListHeader}>
                <div className={styles.sectionTitle}>부채 상세</div>
                <div className={styles.sortTabs}>
                  <button
                    type="button"
                    className={sortMode === 'amount' ? styles.sortTabActive : styles.sortTab}
                    onClick={() => setSortMode('amount')}
                  >
                    금액순
                  </button>
                  <button
                    type="button"
                    className={sortMode === 'dueDay' ? styles.sortTabActive : styles.sortTab}
                    onClick={() => setSortMode('dueDay')}
                  >
                    납부일순
                  </button>
                  <button
                    type="button"
                    className={sortMode === 'payoff' ? styles.sortTabActive : styles.sortTab}
                    onClick={() => setSortMode('payoff')}
                  >
                    완납순
                  </button>
                </div>
              </div>

              {sortedActive.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>등록된 부채가 없습니다.</p>
                  <p className={styles.emptyHint}>설정 → 자산·부채에서 추가할 수 있습니다.</p>
                </div>
              ) : (
                <div className={styles.debtScrollWrap}>
                  <div className={styles.debtCardList}>
                    {sortedActive.map(item => (
                      <DebtCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 도넛 + 비율 게이지 */}
          <div className={styles.mainRight}>
            {/* 종류별 잔여원금 도넛 */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>종류별 잔여원금</div>
              <DebtDonut liabilities={liabilities} />
            </div>

            {/* 부채/자산 비율 (supporter 전용) */}
            <div className={styles.section} style={{ position: 'relative' }}>
              <div className={styles.sectionTitle}>
                부채 / 자산 비율
                {!isSupporter && <span className={styles.lockTag}>✦ 후원자 전용</span>}
              </div>
              <div style={{ opacity: isSupporter ? 1 : 0.2, pointerEvents: isSupporter ? 'auto' : 'none' }}>
                <DebtRatioGauge liabilities={liabilities} accounts={accounts} />
              </div>
              {!isSupporter && (
                <LockedSection onUnlock={() => setShowUnlockModal(true)} />
              )}
            </div>
          </div>
        </div>

        {/* ── 상환 로드맵 (PayoffChart) ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>PAYOFF PROJECTION</div>
          <h3 className={styles.sectionH3}>상환 로드맵</h3>
          <PayoffChart liabilities={liabilities} />
        </div>

      </div>

      {/* ── 코드 입력 모달 ── */}
      {showUnlockModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowUnlockModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>✦ 후원자 코드 입력</div>
            <p className={styles.modalDesc}>
              텀블벅 후원자에게 발송된 코드를 입력하면<br />
              부채 상세 분석 기능이 활성화됩니다.
            </p>
            <input
              className={styles.codeInput}
              type="text"
              placeholder="코드를 입력하세요"
              value={unlockCode}
              onChange={e => { setUnlockCode(e.target.value.toUpperCase()); setUnlockError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              autoFocus
            />
            {unlockError && <p className={styles.codeError}>{unlockError}</p>}
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} type="button" onClick={() => setShowUnlockModal(false)}>취소</button>
              <button
                className={styles.modalConfirmBtn}
                type="button"
                onClick={handleUnlock}
                disabled={unlocking || !unlockCode.trim()}
              >
                {unlocking ? '확인 중…' : '활성화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
