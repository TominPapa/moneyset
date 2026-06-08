// ResetPage — RESET Budget
// Phase 6: 기록 공백 감지 + 복귀 모드 선택 + 처리

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { AmountInput } from '../../components/ui/AmountInput';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { TransactionForm } from '../record/TransactionForm';
import { detectReset, addDays, enumerateDates } from '../../domain/reset';
import type { Transaction, ResetSession, ResetMode } from '../../domain/types';
import { ROUTES } from '../../app/routes';
import styles from './ResetPage.module.css';

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function makeEnvelope<T>(fileType: string, data: T) {
  return {
    schemaVersion: '1.0',
    fileType,
    updatedAt: new Date().toISOString(),
    revisionHint: crypto.randomUUID(),
    data,
  };
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateKo(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// ─── ResetPage ────────────────────────────────────────────────────────────────

type Step = 'loading' | 'no_reset' | 'select_mode' | 'summary_form' | 'detailed_form' | 'done';

export function ResetPage() {
  const config = useAppStore((s) => s.config);
  const activeMonth = useAppStore((s) => s.activeMonth);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const accounts = useAppStore((s) => s.accounts);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('loading');
  const [blankStart, setBlankStart] = useState('');
  const [blankEnd, setBlankEnd] = useState('');
  const [blankDays, setBlankDays] = useState(0);
  const [sessionId] = useState(() => `rs_${crypto.randomUUID()}`);

  // Summary form state
  const [summaryAmount, setSummaryAmount] = useState(0);
  const [summaryCategoryId, setSummaryCategoryId] = useState('');
  const [summaryMemo, setSummaryMemo] = useState('');
  const [summaryError, setSummaryError] = useState('');

  // Detailed recovery state
  const [addedTxIds, setAddedTxIds] = useState<string[]>([]);
  const [txSheetOpen, setTxSheetOpen] = useState(false);
  const [detailDate, setDetailDate] = useState('');

  const [completing, setCompleting] = useState(false);

  // ─── 데이터 로드 + 리셋 감지 ───────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const today = toLocalDateStr(new Date());
      const prevYM = (() => {
        const [y, m] = activeMonth.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      })();

      const [txCur, txPrev, sessions] = await Promise.all([
        localCache.getTransactions(activeMonth),
        localCache.getTransactions(prevYM),
        localCache.getResetSessions(),
      ]);

      const allTx = [...txCur, ...txPrev];
      const txDates = allTx.map((t) => t.date);
      const completedSessions = sessions.filter((s) => s.completedAt);
      const lastReset = completedSessions.length > 0
        ? completedSessions.sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
        : [];

      const lastTxDate = txDates.length > 0 ? [...txDates].sort().reverse()[0] : undefined;
      const lastResetDate = lastReset[0]?.blankPeriodEnd;

      const summary = detectReset({
        today,
        lastTransactionDate: lastTxDate,
        lastResetCompletedDate: lastResetDate,
        resetThresholdDays: config.resetThresholdDays,
      });

      if (!summary.resetNeeded) {
        setStep('no_reset');
        return;
      }

      // 공백 기간: lastEffectiveDate+1 ~ yesterday
      const lastEffective = lastTxDate && lastResetDate
        ? lastTxDate > lastResetDate ? lastTxDate : lastResetDate
        : (lastTxDate ?? lastResetDate ?? '');

      const start = lastEffective ? addDays(lastEffective, 1) : today;
      // blankStart가 어제보다 늦으면 오늘을 포함 (하루 공백 케이스)
      const yesterday = addDays(today, -1);
      const end = start > yesterday ? today : yesterday;

      setBlankStart(start);
      setBlankEnd(end);
      setBlankDays(summary.blankDays);
      setStep('select_mode');
    })();
  }, [activeMonth, config.resetThresholdDays, lastSyncedAt]);

  // ─── 리셋 세션 완료 ────────────────────────────────────────────────────────

  const completeSession = useCallback(
    async (mode: ResetMode, summaryAmt?: number, sumMemo?: string, txIds?: string[]) => {
      const now = new Date().toISOString();
      const session: ResetSession = {
        id: sessionId,
        blankPeriodStart: blankStart,
        blankPeriodEnd: blankEnd,
        mode,
        summaryAmount: summaryAmt,
        summaryMemo: sumMemo,
        recoveredTransactionIds: txIds ?? [],
        completedAt: now,
        createdAt: now,
      };

      await localCache.addResetSession(session);
      const sessions = await localCache.getResetSessions();
      await driveAdapter.writeResetSessions(
        makeEnvelope('resets/reset-sessions.json', sessions),
      );
    },
    [sessionId, blankStart, blankEnd],
  );

  // ─── restart_today ──────────────────────────────────────────────────────────

  const handleRestart = async () => {
    setCompleting(true);
    try {
      await completeSession('restart_today');
      setStep('done');
    } finally {
      setCompleting(false);
    }
  };

  // ─── summary_recovery ───────────────────────────────────────────────────────

  const handleSummaryComplete = async () => {
    if (summaryAmount <= 0) { setSummaryError('금액을 입력해주세요.'); return; }
    if (summaryAmount > 0 && !summaryCategoryId) { setSummaryError('카테고리를 선택해주세요.'); return; }
    setCompleting(true);
    try {
      if (summaryAmount > 0 && summaryCategoryId) {
        const now = new Date().toISOString();
        const tx: Transaction = {
          id: `tx_${crypto.randomUUID()}`,
          ledgerMonth: activeMonth,
          date: blankEnd || addDays(toLocalDateStr(new Date()), -1),
          entryKind: 'expense',
          title: summaryMemo.trim() || `공백 기간 합산 (${blankStart}~${blankEnd})`,
          amount: summaryAmount,
          categoryId: summaryCategoryId,
          isShared: false,
          createdAt: now,
          updatedAt: now,
        };
        await localCache.upsertTransaction(activeMonth, tx);
        const txList = await localCache.getTransactions(activeMonth);
        await driveAdapter.writeTransactions(
          activeMonth,
          makeEnvelope(`months/${activeMonth}.transactions.json`, txList),
        );
        await completeSession('summary_recovery', summaryAmount, tx.title, [tx.id]);
      } else {
        await completeSession('summary_recovery');
      }
      setStep('done');
    } finally {
      setCompleting(false);
    }
  };

  // ─── detailed_recovery ──────────────────────────────────────────────────────

  const handleDetailedSave = useCallback(
    async (tx: Transaction) => {
      await localCache.upsertTransaction(tx.ledgerMonth, tx);
      const txList = await localCache.getTransactions(tx.ledgerMonth);
      await driveAdapter.writeTransactions(
        tx.ledgerMonth,
        makeEnvelope(`months/${tx.ledgerMonth}.transactions.json`, txList),
      );
      setAddedTxIds((prev) => [...prev, tx.id]);
      setTxSheetOpen(false);
    },
    [],
  );

  const handleDetailedComplete = async () => {
    setCompleting(true);
    try {
      await completeSession('detailed_recovery', undefined, undefined, addedTxIds);
      setStep('done');
    } finally {
      setCompleting(false);
    }
  };

  const blankDates = blankStart && blankEnd ? enumerateDates(blankStart, blankEnd) : [];

  const expenseCategories = config.categories
    .filter((c) => c.entryKind === 'expense')
    .map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.name}` }));

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  if (step === 'loading') {
    return (
      <div className={styles.page}>
        <p className={styles.loadingText}>확인 중…</p>
      </div>
    );
  }

  if (step === 'no_reset') {
    return (
      <div className={styles.page}>
        <div className={styles.heroCard}>
          <span className={styles.heroIcon}>✓</span>
          <h2 className={styles.heroTitle}>기록이 최신 상태예요</h2>
          <p className={styles.heroDesc}>공백 기간이 없습니다. 계속 기록해주세요!</p>
        </div>
        <p className={styles.hint}>
          {config.resetThresholdDays}일 이상 기록이 없으면 복귀 화면이 나타납니다.
        </p>
      </div>
    );
  }

  if (step === 'select_mode') {
    return (
      <div className={styles.page}>
        {/* 공백 기간 요약 */}
        <div className={styles.blankCard}>
          <span className={styles.blankIcon}>⚠️</span>
          <h2 className={styles.blankTitle}>{blankDays}일 동안 기록이 없었어요</h2>
          <p className={styles.blankPeriod}>
            {formatDateKo(blankStart)} ~ {formatDateKo(blankEnd)}
          </p>
        </div>

        {/* 복귀 방식 선택 */}
        <p className={styles.selectLabel}>어떻게 복귀하시겠어요?</p>

        <button className={styles.modeCard} onClick={() => setStep('detailed_form')} type="button">
          <div className={styles.modeIcon}>📝</div>
          <div className={styles.modeInfo}>
            <span className={styles.modeTitle}>상세 복구</span>
            <span className={styles.modeDesc}>공백 기간 거래를 하나씩 입력합니다</span>
          </div>
          <span className={styles.modeArrow}>›</span>
        </button>

        <button className={styles.modeCard} onClick={() => setStep('summary_form')} type="button">
          <div className={styles.modeIcon}>📊</div>
          <div className={styles.modeInfo}>
            <span className={styles.modeTitle}>합산 복구</span>
            <span className={styles.modeDesc}>공백 기간 지출 합계만 기록합니다</span>
          </div>
          <span className={styles.modeArrow}>›</span>
        </button>

        <button className={styles.modeCard} onClick={handleRestart} disabled={completing} type="button">
          <div className={styles.modeIcon}>▶️</div>
          <div className={styles.modeInfo}>
            <span className={styles.modeTitle}>오늘부터 재시작</span>
            <span className={styles.modeDesc}>공백 기간은 건너뛰고 오늘부터 이어갑니다</span>
          </div>
          {completing ? <span className={styles.modeArrow}>…</span> : <span className={styles.modeArrow}>›</span>}
        </button>
      </div>
    );
  }

  if (step === 'summary_form') {
    return (
      <div className={styles.page}>
        <div className={styles.stepHeader}>
          <button className={styles.backBtn} onClick={() => setStep('select_mode')} type="button">← 뒤로</button>
          <h2 className={styles.stepTitle}>합산 복구</h2>
        </div>
        <p className={styles.stepDesc}>
          {formatDateKo(blankStart)} ~ {formatDateKo(blankEnd)} 기간의 지출을 합산 입력합니다.
        </p>

        <div className={styles.formSection}>
          <AmountInput
            label="합산 지출 금액"
            value={summaryAmount}
            onChange={(v) => { setSummaryAmount(v); setSummaryError(''); }}
            required
            error={summaryError}
          />
          <Select
            label="카테고리"
            value={summaryCategoryId}
            options={expenseCategories}
            placeholder="카테고리 선택 (선택)"
            onChange={(e) => setSummaryCategoryId(e.target.value)}
          />
          <Input
            label="메모 (선택)"
            value={summaryMemo}
            onChange={(e) => setSummaryMemo(e.target.value)}
            placeholder="예: 공백 기간 식비 합산"
          />
        </div>

        <div className={styles.actionRow}>
          <Button variant="primary" size="lg" fullWidth onClick={handleSummaryComplete} loading={completing}>
            복구 완료
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'detailed_form') {
    return (
      <div className={styles.page}>
        <div className={styles.stepHeader}>
          <button className={styles.backBtn} onClick={() => setStep('select_mode')} type="button">← 뒤로</button>
          <h2 className={styles.stepTitle}>상세 복구</h2>
        </div>
        <p className={styles.stepDesc}>
          공백 기간({blankDays}일) 거래를 날짜별로 입력하세요.
          입력 후 아래 "복구 완료"를 누르면 리셋이 완료됩니다.
        </p>

        {/* 날짜 목록 */}
        <div className={styles.dateList}>
          {blankDates.map((d) => (
            <button
              key={d}
              className={styles.dateItem}
              onClick={() => { setDetailDate(d); setTxSheetOpen(true); }}
              type="button"
            >
              <span className={styles.dateItemLabel}>{formatDateKo(d)}</span>
              <span className={styles.dateItemAction}>+ 거래 추가</span>
            </button>
          ))}
        </div>

        {addedTxIds.length > 0 && (
          <p className={styles.addedCount}>거래 {addedTxIds.length}건 추가됨</p>
        )}

        <div className={styles.actionRow}>
          <Button variant="primary" size="lg" fullWidth onClick={handleDetailedComplete} loading={completing}>
            복구 완료 ({addedTxIds.length}건)
          </Button>
        </div>

        {/* 거래 입력 시트 */}
        <BottomSheet
          open={txSheetOpen}
          onClose={() => setTxSheetOpen(false)}
          title="거래 추가"
        >
          <TransactionForm
            key={detailDate}
            ym={activeMonth}
            categories={config.categories}
            paymentMethods={config.paymentMethods}
            counterparties={config.counterparties}
            accounts={accounts}
            onSave={handleDetailedSave}
            defaultDate={detailDate || undefined}
          />
        </BottomSheet>
      </div>
    );
  }

  // done
  return (
    <div className={styles.page}>
      <div className={styles.heroCard}>
        <span className={styles.heroIcon}>🎉</span>
        <h2 className={styles.heroTitle}>복귀 완료!</h2>
        <p className={styles.heroDesc}>기록 공백이 처리되었습니다. 다시 시작해봐요.</p>
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={() => navigate(ROUTES.home)}>
        홈으로 이동
      </Button>
    </div>
  );
}
