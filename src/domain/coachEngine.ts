// coachEngine.ts — 규칙 기반 재무 코치 엔진
// 순수 함수: 외부 API 없음, 기존 계산 데이터만 사용

import type { SafetySummary } from './types';
import type { SafetyInput } from './safety';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type TipType = 'positive' | 'warning' | 'danger' | 'info';

export interface CoachTip {
  id: string;
  type: TipType;
  title: string;
  body: string;
  metric?: string; // 강조 숫자/값 (예: "32%", "−45,000원")
}

export interface CategoryStat {
  catId: string;
  categoryName: string;
  total: number;        // 이번 달 지출
  prevTotal: number;    // 전월 지출
  budgetAmount: number; // 예산 (0이면 미설정)
  percent: number;      // 지출 / 총지출 %
}

export interface CoachEngineInput {
  summary: SafetySummary;
  safetyInput: SafetyInput;
  categoryStats: CategoryStat[];
  todayExpense: number;
  fixedTotal: number;
  activeMonth: string; // YYYY-MM
}

// ─── 포맷 유틸 ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}
function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}

// ─── 규칙 엔진 ────────────────────────────────────────────────────────────────

export function generateTips(input: CoachEngineInput): CoachTip[] {
  const tips: CoachTip[] = [];
  const { summary, safetyInput, categoryStats, todayExpense, fixedTotal } = input;

  // ── 1. 안전도 레벨 기반 ───────────────────────────────────────────────────
  if (summary.safetyLevel === 'critical') {
    tips.push({
      id: 'safety_critical',
      type: 'danger',
      title: '예산 위기 경보',
      body: '생활비 예산을 초과했어요. 당장 지출을 멈추지 않으면 월말에 심각한 자금 부족이 올 수 있어요.',
      metric: formatScore(summary.safetyScore),
    });
  } else if (summary.safetyLevel === 'risk') {
    tips.push({
      id: 'safety_risk',
      type: 'danger',
      title: '예산 초과 위험',
      body: `남은 생활비 ${fmt(Math.max(0, summary.monthlySpendableRemaining))}으로 월말까지 버티기 빠듯해요. 큰 지출은 자제하세요.`,
      metric: formatScore(summary.safetyScore),
    });
  } else if (summary.safetyLevel === 'warning') {
    tips.push({
      id: 'safety_warning',
      type: 'warning',
      title: '지출 속도 주의',
      body: `지출 속도가 조금 빠른 편이에요. 일 권장 한도 ${fmt(Math.round(summary.dailyRecommendedLimit))}를 지켜보세요.`,
      metric: formatScore(summary.safetyScore),
    });
  } else if (summary.safetyLevel === 'very_safe') {
    tips.push({
      id: 'safety_very_safe',
      type: 'positive',
      title: '재무 상태 최상위',
      body: `안전도 점수 ${Math.round(summary.safetyScore)}점! 수입보다 훨씬 적게 쓰고 있어요. 저축이나 투자를 고려해볼 좋은 시점이에요.`,
      metric: `${Math.round(summary.safetyScore)}점`,
    });
  } else if (summary.safetyLevel === 'safe') {
    tips.push({
      id: 'safety_safe',
      type: 'positive',
      title: '안정적인 지출 관리',
      body: `이번 달 페이스 좋아요. 남은 ${fmt(Math.max(0, summary.monthlySpendableRemaining))} 안에서 계획적으로 써보세요.`,
    });
  }

  // ── 2. 주간 초과 비율 ────────────────────────────────────────────────────
  if (summary.weeklyOverspendRatio > 1.3) {
    tips.push({
      id: 'weekly_overspend_high',
      type: 'warning',
      title: '이번 주 지출이 너무 빨라요',
      body: `이번 주 권장 한도의 ${fmtPct(summary.weeklyOverspendRatio * 100)}를 소비했어요. 주말 지출을 크게 줄여야 해요.`,
      metric: fmtPct(summary.weeklyOverspendRatio * 100),
    });
  } else if (summary.weeklyOverspendRatio > 1.1) {
    tips.push({
      id: 'weekly_overspend_mild',
      type: 'warning',
      title: '이번 주 속도 조금 빠름',
      body: `주간 권장 한도를 ${fmtPct((summary.weeklyOverspendRatio - 1) * 100)} 초과했어요. 이번 주 남은 날은 최대한 절약해요.`,
      metric: `+${fmtPct((summary.weeklyOverspendRatio - 1) * 100)}`,
    });
  } else if (summary.weeklyOverspendRatio < 0.6 && safetyInput.weeklyLivingSpent > 0) {
    tips.push({
      id: 'weekly_good',
      type: 'positive',
      title: '이번 주 지출 여유 있음',
      body: `주간 권장 한도의 ${fmtPct(summary.weeklyOverspendRatio * 100)}만 사용했어요. 이 페이스라면 월말도 문제없어요.`,
    });
  }

  // ── 3. 오늘 지출 없음 ────────────────────────────────────────────────────
  if (todayExpense === 0) {
    tips.push({
      id: 'zero_today',
      type: 'positive',
      title: '오늘 아직 무지출!',
      body: '오늘 지출이 없어요. 이대로 하루를 마무리하면 절약 달성이에요.',
    });
  }

  // ── 4. 고정지출 커버 분석 ─────────────────────────────────────────────────
  const monthsCover = fixedTotal > 0
    ? Math.floor(summary.monthlySpendableRemaining / fixedTotal) : 99;
  if (fixedTotal > 0 && monthsCover < 1 && summary.safetyLevel !== 'critical') {
    tips.push({
      id: 'fixed_cover_low',
      type: 'danger',
      title: '고정지출 1개월치도 없음',
      body: `현재 잔액으로 고정지출 ${fmt(fixedTotal)}을 1개월도 감당하지 못해요. 비상자금을 확보하세요.`,
    });
  } else if (fixedTotal > 0 && monthsCover >= 6) {
    tips.push({
      id: 'fixed_cover_great',
      type: 'positive',
      title: `고정지출 ${monthsCover}개월분 확보`,
      body: '비상금이 충분해요. 안정적인 재무 기반 위에 있어요.',
      metric: `${monthsCover}개월`,
    });
  }

  // ── 5. 카테고리별 MoM 급등 ───────────────────────────────────────────────
  for (const cat of categoryStats.slice(0, 6)) {
    if (cat.prevTotal <= 0 || cat.total <= 0) continue;
    const ratio = cat.total / cat.prevTotal;
    if (ratio >= 1.3 && cat.total >= 30_000) {
      const delta = Math.round((ratio - 1) * 100);
      tips.push({
        id: `mom_${cat.catId}`,
        type: 'warning',
        title: `${cat.categoryName} 지출 급증`,
        body: `${cat.categoryName} 지출이 전월 대비 ${delta}% 늘었어요 (${fmt(cat.prevTotal)} → ${fmt(cat.total)}).`,
        metric: `+${delta}%`,
      });
    }
  }

  // ── 6. 카테고리 예산 초과 ─────────────────────────────────────────────────
  for (const cat of categoryStats) {
    if (cat.budgetAmount <= 0 || cat.total <= cat.budgetAmount) continue;
    const overPct = Math.round((cat.total / cat.budgetAmount - 1) * 100);
    if (overPct >= 10) {
      tips.push({
        id: `budget_over_${cat.catId}`,
        type: overPct >= 50 ? 'danger' : 'warning',
        title: `${cat.categoryName} 예산 초과`,
        body: `${cat.categoryName} 예산 ${fmt(cat.budgetAmount)}을 ${overPct}% 초과했어요 (${fmt(cat.total)} 지출).`,
        metric: `+${overPct}%`,
      });
    }
  }

  // ── 7. 일 권장 한도 ──────────────────────────────────────────────────────
  if (summary.dailyRecommendedLimit > 0 && summary.dailyRecommendedLimit < 15_000) {
    tips.push({
      id: 'daily_low',
      type: 'warning',
      title: '오늘 권장 한도가 낮아요',
      body: `남은 기간을 감안하면 오늘은 ${fmt(Math.round(summary.dailyRecommendedLimit))} 이내로만 써야 해요. 식비 위주로만 써보세요.`,
      metric: fmt(Math.round(summary.dailyRecommendedLimit)),
    });
  }

  // ── 8. 전체 지출 없는 경우 (신규 사용자) ─────────────────────────────────
  if (safetyInput.livingSpentSoFar === 0 && safetyInput.expectedNetIncome > 0) {
    tips.push({
      id: 'no_transactions',
      type: 'info',
      title: '이번 달 지출을 기록해보세요',
      body: '아직 이번 달 지출 기록이 없어요. 거래를 추가하면 맞춤 분석이 시작돼요.',
    });
  }

  // 중복 제거 + 최대 5개 (danger → warning → info → positive 순)
  const priority: TipType[] = ['danger', 'warning', 'info', 'positive'];
  const seen = new Set<string>();
  const sorted = tips
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
    .sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));

  return sorted.slice(0, 5);
}

function formatScore(score: number): string {
  return score >= 200 ? '200+점' : `${Math.round(score)}점`;
}
