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
  // 만기일시상환은 이자 = P×r이므로 totalBalance/monthlyAmount가 수십 배 틀림 → 0 처리
  if (item.repaymentType === 'bullet') return 0;
  if (item.totalBalance && item.monthlyAmount > 0) return Math.ceil(item.totalBalance / item.monthlyAmount);
  return 0;
}

function effectivePayoffDate(item: Liability): string {
  const months = effectiveMonths(item);
  if (months <= 0) return '—';
  // 1일 기준으로 생성해야 setMonth에 의한 월말 돌변(예: 1월 31일 + 1개월 → 3월 2일) 방지
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + months, 1);
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
  if (v >= 1_000) return `${Math.round(v / 1_000)}천`;
  return String(Math.round(v));
}

function calcBalanceAt(
  principal: number,
  annualRate: number,
  totalMonths: number,
  type: string | undefined,
  m: number,
): number {
  if (m >= totalMonths) return 0;
  if (!type || type === 'equal_principal') {
    // 원금균등 or 미설정: 원금 선형 감소
    return Math.max(0, principal * (1 - m / totalMonths));
  }
  if (type === 'annuity') {
    if (!annualRate) return Math.max(0, principal * (1 - m / totalMonths));
    const r = annualRate / 100 / 12;
    const rn = Math.pow(1 + r, totalMonths);
    const rm = Math.pow(1 + r, m);
    return Math.max(0, principal * (rn - rm) / (rn - 1));
  }
  if (type === 'bullet') {
    // 만기일시: 원금 유지, 마지막 달에 0
    return principal;
  }
  return Math.max(0, principal * (1 - m / totalMonths));
}

function PayoffChart({ liabilities }: { liabilities: Liability[] }) {
  const allItems = liabilities.filter(l => l.isActive && effectiveMonths(l) > 0);
  const [selectedId, setSelectedId] = useState<string>(() => allItems[0]?.id ?? '');
  const [hover, setHover] = useState<{ svgX: number; month: number; balance: number } | null>(null);

  if (allItems.length === 0) {
    return <div className={styles.chartEmpty}>상환 기간 데이터가 없습니다.</div>;
  }

  const sel = allItems.find(i => i.id === selectedId) ?? allItems[0];
  const color = LIABILITY_KIND_COLORS[sel.kind] ?? '#8F8D85';
  const steps = effectiveMonths(sel); // 총 상환 개월 수 (캡 없음)
  const principal = sel.totalBalance ?? sel.monthlyAmount * steps;

  function balanceAt(m: number): number {
    return calcBalanceAt(principal, sel.interestRate ?? 0, steps, sel.repaymentType, m);
  }

  const W = 640, H = 220, padL = 56, padR = 16, padT = 24, padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxY = balanceAt(0);

  // 원금 데이터 없음 — divide-by-zero 방지
  if (maxY <= 0) {
    return (
      <div className={styles.chartWrap}>
        <div className={styles.chartEmpty}>잔여 원금 정보가 없어 차트를 표시할 수 없습니다.</div>
      </div>
    );
  }

  function xPos(m: number) { return padL + (m / steps) * chartW; }
  function yPos(v: number) { return padT + chartH - (v / maxY) * chartH; }

  // 면적 경로 — 월별로 모두 계산하면 너무 많으니 100 포인트로 샘플링
  const sampleCount = Math.min(steps, 200);
  const samplePts = Array.from({ length: sampleCount + 1 }, (_, i) => {
    const m = Math.round((i / sampleCount) * steps);
    return { m, b: balanceAt(m) };
  });
  const topLine = samplePts.map(p => `${xPos(p.m)},${yPos(p.b)}`).join(' L ');
  const areaPath = `M ${topLine.split(' L ')[0]} L ${topLine} L ${xPos(steps)},${yPos(0)} L ${xPos(0)},${yPos(0)} Z`;

  // Y축 기준선
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

  // X축 레이블 — 상환 기간에 맞게 단위 자동 조정
  const xLabels: { m: number; label: string }[] = [];
  const stepM = steps < 6 ? 1 : steps < 18 ? 3 : steps < 60 ? 6 : steps < 120 ? 12 : steps < 240 ? 24 : 60;
  for (let m = stepM; m <= steps; m += stepM) {
    const label = m % 12 === 0 ? `${m / 12}년` : `${m}개월`;
    xLabels.push({ m, label });
  }

  // 마우스 호버 핸들러
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const chartX = svgX - padL;
    if (chartX < 0 || chartX > chartW) { setHover(null); return; }
    const month = Math.round((chartX / chartW) * steps);
    setHover({ svgX, month, balance: balanceAt(month) });
  }

  return (
    <div className={styles.chartWrap}>
      {/* 부채 선택 탭 */}
      <div className={styles.chartLegend}>
        {allItems.map(item => {
          const c = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
          const em = effectiveMonths(item);
          const sub = em >= 12 ? `${Math.round(em / 12)}년 상환` : `${em}개월 상환`;
          return (
            <button key={item.id} type="button"
              className={`${styles.chartLegendItem} ${item.id === (sel.id) ? styles.chartLegendItemSelected : ''}`}
              onClick={() => { setSelectedId(item.id); setHover(null); }}
            >
              <span className={styles.chartLegendDot} style={{ background: c }} />
              <span className={styles.chartLegendName}>{item.name}</span>
              <span className={styles.chartLegendSub}>{sub}</span>
            </button>
          );
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        className={styles.chartSvg} style={{ cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.65" />
            <stop offset="100%" stopColor={color} stopOpacity="0.08" />
          </linearGradient>
        </defs>

        {/* Y축 그리드 + 레이블 */}
        {yTicks.map((pct, i) => {
          const v = maxY * pct;
          const y = yPos(v);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={padL + chartW} y2={y}
                stroke="var(--line)" strokeWidth={i === 0 ? 1 : 0.5}
                strokeDasharray={pct === 1.0 ? 'none' : '4,4'} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="var(--text-3)" fontSize="9">
                {pct === 0 ? '0' : fmtAmt(v)}
              </text>
            </g>
          );
        })}

        {/* 면적 + 선 */}
        <path d={areaPath} fill="url(#payGrad)" />
        <polyline points={samplePts.map(p => `${xPos(p.m)},${yPos(p.b)}`).join(' ')}
          fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.85" strokeLinejoin="round" />

        {/* X축 */}
        <line x1={padL} y1={padT + chartH} x2={padL + chartW} y2={padT + chartH} stroke="var(--line-strong)" strokeWidth="1" />
        {xLabels.map(({ m, label }) => (
          <text key={m} x={xPos(m)} y={H - 8} textAnchor="middle" fill="var(--text-3)" fontSize="9">{label}</text>
        ))}

        {/* 완납 마커 */}
        <circle cx={xPos(steps)} cy={yPos(0)} r="5" fill={color} />
        <circle cx={xPos(steps)} cy={yPos(0)} r="3" fill="var(--bg-2)" />
        <circle cx={xPos(steps)} cy={yPos(0)} r="1.5" fill={color} />
        <text x={xPos(steps)} y={padT - 8} textAnchor="middle" fill={color} fontSize="9" fontWeight="700">완납</text>

        {/* 호버 툴팁 */}
        {hover && hover.balance > 0 && (() => {
          const bx = hover.svgX;
          const by = yPos(hover.balance);
          const flip = bx > W * 0.65;
          const tx = flip ? bx - 96 : bx + 10;
          const ty = Math.max(padT + 2, by - 38);
          const monthLabel = hover.month >= 12
            ? `${Math.floor(hover.month / 12)}년 ${hover.month % 12 ? hover.month % 12 + '개월' : ''} 후`.trim()
            : `${hover.month}개월 후`;
          return (
            <g>
              <line x1={bx} y1={padT} x2={bx} y2={padT + chartH}
                stroke={color} strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.6" />
              <circle cx={bx} cy={by} r="5" fill={color} stroke="var(--bg-2)" strokeWidth="2" />
              <rect x={tx} y={ty} width="86" height="36" rx="6"
                fill="var(--bg-3)" stroke={color} strokeWidth="0.8" strokeOpacity="0.6" />
              <text x={tx + 43} y={ty + 14} textAnchor="middle" fill="var(--text-0)" fontSize="12" fontWeight="700">
                {fmtAmt(hover.balance)}원
              </text>
              <text x={tx + 43} y={ty + 28} textAnchor="middle" fill="var(--text-3)" fontSize="9">
                {monthLabel}
              </text>
            </g>
          );
        })()}
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
  // 자산=0이고 부채>0이면 위험 최대(100%), 자산=0이고 부채=0이면 0%
  const ratio = totalAssets > 0
    ? Math.min(100, Math.round((totalDebt / totalAssets) * 100))
    : totalDebt > 0 ? 100 : 0;
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
            strokeDasharray={`${(ratio / 100) * Math.PI * 80} ${Math.PI * 80}`}
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
  // 라우터에서 RequireFeature('debt')로 게이팅 완료 → 이 페이지에 도달한 사용자는 권한 있음
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


  return (
    <div className={styles.page}>

      {/* ── 상단 헤더 ── */}
      <div className={styles.topBar}>
        <div>
          <div className={styles.topSubtitle}>DEBT MANAGEMENT</div>
          <div className={styles.topTitle}>부채 관리</div>
        </div>
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
            hint={(() => {
              if (!active.length) return '상환 기간 미설정';
              const longestItem = active.reduce((a, b) => effectiveMonths(a) > effectiveMonths(b) ? a : b);
              const payoff = effectivePayoffDate(longestItem);
              return payoff !== '—' ? payoff + ' 완납 예정' : '상환 기간 미설정';
            })()}
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
              <div className={styles.sectionTitle}>부채 / 자산 비율</div>
              <DebtRatioGauge liabilities={liabilities} accounts={accounts} />
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

    </div>
  );
}
