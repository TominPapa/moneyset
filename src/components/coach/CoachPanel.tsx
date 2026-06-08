// CoachPanel — 규칙 기반 AI 코치 패널
// 자체 데이터 로딩 + coachEngine 실행 + 팁 렌더링

import { useState, useEffect } from 'react';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { buildSafetyInput } from '../../domain/safetyUtils';
import { calcSafetySummary } from '../../domain/safety';
import { generateTips } from '../../domain/coachEngine';
import type { CoachTip, CategoryStat as EngineCatStat } from '../../domain/coachEngine';
import { getBudgetPlan } from '../../storage/localPlanStore';
import type { Transaction } from '../../domain/types';
import styles from './CoachPanel.module.css';

// ─── 아이콘 맵 ────────────────────────────────────────────────────────────────

function TipIcon({ type }: { type: CoachTip['type'] }) {
  const map = { positive: '✦', warning: '⚠', danger: '!', info: '·' };
  return <span className={`${styles.tipIcon} ${styles[`tipIcon_${type}`]}`}>{map[type]}</span>;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function prevYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function toLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── CoachPanel ───────────────────────────────────────────────────────────────

interface CoachPanelProps {
  onClose: () => void;
}

export function CoachPanel({ onClose }: CoachPanelProps) {
  const config       = useAppStore(s => s.config);
  const activeMonth  = useAppStore(s => s.activeMonth);
  const lastSyncedAt = useAppStore(s => s.lastSyncedAt);

  const [tips, setTips]       = useState<CoachTip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [txs, prevTxs] = await Promise.all([
        localCache.getTransactions(activeMonth),
        localCache.getTransactions(prevYM(activeMonth)),
      ]);

      // Safety 계산
      const safetyInput = buildSafetyInput(txs as Transaction[], config);
      const summary = calcSafetySummary(safetyInput);

      // 카테고리별 집계
      const catMap = new Map(config.categories.map(c => [c.id, c]));

      const currCatMap = new Map<string, number>();
      for (const tx of txs) {
        if (tx.entryKind !== 'expense') continue;
        currCatMap.set(tx.categoryId, (currCatMap.get(tx.categoryId) ?? 0) + tx.amount);
      }
      const prevCatMap = new Map<string, number>();
      for (const tx of prevTxs) {
        if (tx.entryKind !== 'expense') continue;
        prevCatMap.set(tx.categoryId, (prevCatMap.get(tx.categoryId) ?? 0) + tx.amount);
      }

      const totalExpense = Array.from(currCatMap.values()).reduce((s, v) => s + v, 0);

      // BudgetPlan에서 카테고리 예산 조회
      const budgetMap = new Map<string, number>();
      try {
        const plan = await getBudgetPlan(activeMonth);
        if (plan) {
          for (const item of plan.items) {
            budgetMap.set(item.categoryId, item.budgetAmount);
          }
        }
      } catch { /* 플랜 없으면 무시 */ }

      const categoryStats: EngineCatStat[] = Array.from(currCatMap.entries())
        .map(([catId, total]) => ({
          catId,
          categoryName: catMap.get(catId)?.name ?? '기타',
          total,
          prevTotal: prevCatMap.get(catId) ?? 0,
          budgetAmount: budgetMap.get(catId) ?? 0,
          percent: totalExpense > 0 ? total / totalExpense * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);

      // 오늘 지출
      const todayStr = toLocalDate();
      const todayExpense = txs
        .filter(t => t.entryKind === 'expense' && t.date === todayStr)
        .reduce((s, t) => s + t.amount, 0);

      // 고정지출 합계
      const fixedTotal = config.fixedExpenses
        .filter(r => r.isActive)
        .reduce((s, r) => s + r.amount, 0);

      const generated = generateTips({
        summary, safetyInput, categoryStats,
        todayExpense, fixedTotal, activeMonth,
      });

      setTips(generated);
      setLoading(false);
    })();
  }, [activeMonth, config, lastSyncedAt]);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>맞춤 인사이트</span>
        <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="닫기">✕</button>
      </div>

      {loading ? (
        <div className={styles.loadingRow}>
          <span className={styles.loadingDot}/>
          <span className={styles.loadingDot}/>
          <span className={styles.loadingDot}/>
        </div>
      ) : tips.length === 0 ? (
        <div className={styles.emptyMsg}>
          분석할 데이터가 아직 없어요.<br/>거래를 기록하면 맞춤 팁이 나타나요.
        </div>
      ) : (
        <div className={styles.tipList}>
          {tips.map(tip => (
            <div key={tip.id} className={`${styles.tipCard} ${styles[`tipCard_${tip.type}`]}`}>
              <div className={styles.tipCardHead}>
                <TipIcon type={tip.type}/>
                <span className={styles.tipTitle}>{tip.title}</span>
                {tip.metric && (
                  <span className={`${styles.tipMetric} ${styles[`tipMetric_${tip.type}`]}`}>
                    {tip.metric}
                  </span>
                )}
              </div>
              <p className={styles.tipBody}>{tip.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className={styles.panelFoot}>
        <span className={styles.footNote}>규칙 기반 분석 · 이번 달 데이터 기준</span>
      </div>
    </div>
  );
}
