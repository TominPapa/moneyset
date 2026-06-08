// SettlementPage — RESET Budget V2 (PC Dashboard Layout)

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import type {
  SharedExpense,
  SettlementTransfer,
  Counterparty,
  Transaction,
  AppConfig,
} from '../../domain/types';
import { calcNetReceivable, calcNetPayable } from '../../domain/sharedSettlement';
import styles from './SettlementPage.module.css';

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

function fmt(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function remainingAmount(expense: SharedExpense, transfers: SettlementTransfer[]): number {
  if (expense.paidBy === 'me') {
    return Math.max(0, calcNetReceivable(expense, transfers));
  }
  return Math.max(0, calcNetPayable(expense, transfers));
}

function calcSummary(expenses: SharedExpense[], transfers: SettlementTransfer[]): { receivable: number; payable: number } {
  let receivable = 0;
  let payable = 0;
  for (const e of expenses) {
    if (e.status === 'settled') continue;
    receivable += Math.max(0, calcNetReceivable(e, transfers));
    payable += Math.max(0, calcNetPayable(e, transfers));
  }
  return { receivable, payable };
}

function statusLabel(status: SharedExpense['status']): string {
  return status === 'settled' ? '정산 완료' : status === 'partially_settled' ? '일부 정산' : '미정산';
}

function statusColor(status: SharedExpense['status']): string {
  return status === 'settled'
    ? 'var(--safety-safe)'
    : status === 'partially_settled'
    ? 'var(--safety-warning)'
    : 'var(--text-muted)';
}

// ─── SettlementPage ───────────────────────────────────────────────────────────

export function SettlementPage() {
  const config      = useAppStore((s) => s.config);
  const setConfig   = useAppStore((s) => s.setConfig);
  const activeMonth = useAppStore((s) => s.activeMonth);
  const setActiveMonth = useAppStore((s) => s.setActiveMonth);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);

  const [sharedExpenses, setSharedExpenses] = useState<SharedExpense[]>([]);
  const [transactions, setTransactions]     = useState<Transaction[]>([]);
  const [transfers, setTransfers]           = useState<SettlementTransfer[]>([]);

  const [cpSheetOpen, setCpSheetOpen] = useState(false);
  const [cpName, setCpName]           = useState('');
  const [cpNameError, setCpNameError] = useState('');
  const [savingCp, setSavingCp]       = useState(false);

  const [settlingId, setSettlingId] = useState<string | null>(null);

  // 필터
  const [filterCpId, setFilterCpId] = useState<string>('');

  const load = useCallback(async () => {
    const [expenses, txList, trList] = await Promise.all([
      localCache.getSharedExpenses(activeMonth),
      localCache.getTransactions(activeMonth),
      localCache.getSettlementTransfers(),
    ]);
    setSharedExpenses(expenses);
    setTransactions(txList);
    setTransfers(trList);
  }, [activeMonth, lastSyncedAt]);

  useEffect(() => { load(); }, [load]);

  const { receivable, payable } = calcSummary(sharedExpenses, transfers);
  const net = receivable - payable;

  // 설정된 상대방 목록 + 공동지출에서 참조하지만 설정에 없는 ID도 폴백으로 포함
  const configCpMap = new Map(config.counterparties.map((c) => [c.id, c]));
  const derivedCpIds = Array.from(new Set(sharedExpenses.map((e) => e.counterpartyId)));
  const derivedCounterparties: Counterparty[] = derivedCpIds.map((id) =>
    configCpMap.get(id) ?? { id, name: '정산 상대', isDefault: false },
  );
  // config.counterparties 에만 있는 항목도 포함 (sharedExpenses에 없는 상대방도 보여줌)
  const allCounterparties: Counterparty[] = [
    ...derivedCounterparties,
    ...config.counterparties.filter((c) => !derivedCpIds.includes(c.id)),
  ];

  const counterpartyMap = new Map(allCounterparties.map((c) => [c.id, c]));
  const txMap           = new Map(transactions.map((t) => [t.id, t]));

  // ─── 상대방 추가 ─────────────────────────────────────────────────────────

  const handleAddCounterparty = async () => {
    if (!cpName.trim()) { setCpNameError('이름을 입력해주세요.'); return; }
    setSavingCp(true);
    const newCp: Counterparty = {
      id: `cp_${crypto.randomUUID()}`,
      name: cpName.trim(),
      isDefault: config.counterparties.length === 0,
    };
    const newConfig: AppConfig = {
      ...config,
      counterparties: [...config.counterparties, newCp],
    };
    try {
      await localCache.setConfig(newConfig);
      await driveAdapter.writeConfig(makeEnvelope('config.json', newConfig));
      setConfig(newConfig);
      setCpName('');
      setCpSheetOpen(false);
    } finally {
      setSavingCp(false);
    }
  };

  // ─── 정산 완료 처리 ──────────────────────────────────────────────────────

  const handleSettle = async (expense: SharedExpense) => {
    const remaining = remainingAmount(expense, transfers);
    if (remaining <= 0) return;

    setSettlingId(expense.id);
    const now   = new Date().toISOString();
    const today = toLocalDateStr(new Date());

    const transfer: SettlementTransfer = {
      id: `st_${crypto.randomUUID()}`,
      sharedExpenseId: expense.id,
      direction: expense.paidBy === 'me' ? 'in' : 'out',
      amount: remaining,
      transferredAt: today,
      createdAt: now,
    };

    const updatedExpense: SharedExpense = {
      ...expense,
      settledInAmount:
        expense.paidBy === 'me'
          ? expense.settledInAmount + remaining
          : expense.settledInAmount,
      settledOutAmount:
        expense.paidBy === 'counterparty'
          ? expense.settledOutAmount + remaining
          : expense.settledOutAmount,
      status: 'settled',
      updatedAt: now,
    };

    try {
      await localCache.addSettlementTransfer(transfer);
      await localCache.upsertSharedExpense(activeMonth, updatedExpense);

      const [updatedExpenses, updatedTransfers] = await Promise.all([
        localCache.getSharedExpenses(activeMonth),
        localCache.getSettlementTransfers(),
      ]);

      await Promise.all([
        driveAdapter.writeSharedExpenses(
          activeMonth,
          makeEnvelope(`shared/${activeMonth}.shared-expenses.json`, updatedExpenses),
        ),
        driveAdapter.writeSettlementTransfers(
          makeEnvelope('shared/settlement-transfers.json', updatedTransfers),
        ),
      ]);

      setSharedExpenses(updatedExpenses);
    } finally {
      setSettlingId(null);
    }
  };

  // ─── 상대방 삭제 ─────────────────────────────────────────────────────────

  const handleDeleteCounterparty = async (cpId: string, cpName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 필터 선택 클릭 방지

    // 이번 달 공동지출 중 해당 상대가 엮인 미정산 건이 있는지 체크
    const hasLinked = sharedExpenses.some((ex) => ex.counterpartyId === cpId && ex.status !== 'settled');
    if (hasLinked) {
      alert(`'${cpName}' 님과 정산되지 않은 이번 달 공동지출 내역이 있어 삭제할 수 없습니다.`);
      return;
    }

    if (!confirm(`'${cpName}' 님을 정산 상대에서 삭제하시겠습니까?`)) {
      return;
    }

    const newCpList = config.counterparties.filter((c) => c.id !== cpId);
    const newConfig: AppConfig = {
      ...config,
      counterparties: newCpList,
    };

    if (filterCpId === cpId) {
      setFilterCpId('');
    }

    await localCache.setConfig(newConfig);
    await driveAdapter.writeConfig(makeEnvelope('config.json', newConfig));
    setConfig(newConfig);
  };

  // ─── 렌더 ────────────────────────────────────────────────────────────────

  const sortedExpenses = [...sharedExpenses]
    .filter((e) => !filterCpId || e.counterpartyId === filterCpId)
    .sort((a, b) => {
      const txA = txMap.get(a.transactionId);
      const txB = txMap.get(b.transactionId);
      // 삭제된 거래(date 없음)는 맨 뒤로 보내기
      const dA = txA?.date ?? '0000-00-00';
      const dB = txB?.date ?? '0000-00-00';
      return dB.localeCompare(dA);
    });

  const openCount   = sharedExpenses.filter(e => e.status !== 'settled').length;
  const settledCount = sharedExpenses.filter(e => e.status === 'settled').length;

  return (
    <div className={styles.page}>
      {/* ── 상단 바 ── */}
      <div className={styles.topBar}>
        <div className={styles.monthNav}>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(prevYM(activeMonth))} aria-label="이전 달">←</button>
          <span className={styles.monthLabel}>{activeMonth}</span>
          <button className={styles.monthBtn} onClick={() => setActiveMonth(nextYM(activeMonth))} aria-label="다음 달">→</button>
        </div>

        <div className={styles.topSummary}>
          <div className={styles.summaryChip}>
            <span className={styles.summaryChipLabel}>받을 돈</span>
            <span className={styles.summaryChipVal} style={{ color: receivable > 0 ? 'var(--income)' : undefined }}>
              +{fmt(receivable)}
            </span>
          </div>
          <div className={styles.summaryChip}>
            <span className={styles.summaryChipLabel}>줄 돈</span>
            <span className={styles.summaryChipVal} style={{ color: payable > 0 ? 'var(--expense)' : undefined }}>
              -{fmt(payable)}
            </span>
          </div>
          <div className={styles.summaryChip}>
            <span className={styles.summaryChipLabel}>순 정산</span>
            <span className={styles.summaryChipVal} style={{ color: net >= 0 ? 'var(--income)' : 'var(--expense)' }}>
              {net >= 0 ? '+' : ''}{fmt(net)}
            </span>
          </div>
          <div className={styles.summaryChip}>
            <span className={styles.summaryChipLabel}>미정산 / 완료</span>
            <span className={styles.summaryChipVal}>{openCount} / {settledCount}</span>
          </div>
        </div>
      </div>

      {/* ── 메인 그리드 ── */}
      <div className={styles.mainGrid}>

        {/* ── 왼쪽: 요약 + 상대방 ── */}
        <div className={styles.leftCol}>

          {/* 요약 카드 */}
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>받을 돈 (미정산)</span>
              <span className={styles.summaryValue} style={{ color: receivable > 0 ? 'var(--income)' : undefined }}>
                {fmt(receivable)}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>줄 돈 (미정산)</span>
              <span className={styles.summaryValue} style={{ color: payable > 0 ? 'var(--expense)' : undefined }}>
                {fmt(payable)}
              </span>
            </div>
          </div>

          {/* 상대방 목록 */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>정산 상대</span>
              <button className={styles.addBtn} onClick={() => setCpSheetOpen(true)} type="button">
                + 추가
              </button>
            </div>
            {allCounterparties.length === 0 ? (
              <div className={styles.emptyHint}>
                <p>정산 상대가 없습니다.</p>
                <p className={styles.emptySubHint}>추가 버튼으로 상대방을 등록하세요.</p>
              </div>
            ) : (
              <div className={styles.cpList}>
                {allCounterparties.map((cp) => {
                  const cpExpenses = sharedExpenses.filter((e) => e.counterpartyId === cp.id && e.status !== 'settled');
                  const cpReceivable = cpExpenses
                    .filter((e) => e.paidBy === 'me')
                    .reduce((s, e) => s + Math.max(0, calcNetReceivable(e, transfers)), 0);
                  const cpPayable = cpExpenses
                    .filter((e) => e.paidBy === 'counterparty')
                    .reduce((s, e) => s + Math.max(0, calcNetPayable(e, transfers)), 0);
                  const cpNet = cpReceivable - cpPayable;
                  const isActive = filterCpId === cp.id;
                  return (
                    <div
                      key={cp.id}
                      className={`${styles.cpItem} ${isActive ? styles.cpItemActive : ''}`}
                      onClick={() => setFilterCpId(isActive ? '' : cp.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setFilterCpId(isActive ? '' : cp.id);
                        }
                      }}
                    >
                      <div className={styles.cpAvatar}>{cp.name[0]}</div>
                      <span className={styles.cpName}>{cp.name}</span>
                      {cpNet !== 0 && (
                        <span
                          className={styles.cpBalance}
                          style={{ color: cpNet > 0 ? 'var(--income)' : 'var(--expense)' }}
                        >
                          {cpNet > 0 ? '+' : ''}{fmt(cpNet)}
                        </span>
                      )}
                      {cpNet === 0 && <span className={styles.cpSettled}>✓ 정산 완료</span>}
                      
                      <button
                        className={styles.deleteCpBtn}
                        onClick={(e) => handleDeleteCounterparty(cp.id, cp.name, e)}
                        title="상대방 삭제"
                        type="button"
                        aria-label={`${cp.name} 정산 상대 삭제`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 오른쪽: 공동지출 목록 ── */}
        <div className={styles.rightCol}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>
                공동지출 내역
                {filterCpId && ` · ${counterpartyMap.get(filterCpId)?.name ?? ''}`}
              </span>
              {filterCpId && (
                <button className={styles.addBtn} onClick={() => setFilterCpId('')}>전체 보기</button>
              )}
            </div>

            {sortedExpenses.length === 0 ? (
              <div className={styles.emptyHint}>
                <p>이번 달 공동지출 내역이 없습니다.</p>
                <p className={styles.emptySubHint}>거래 추가 시 "공동지출" 토글을 켜세요.</p>
              </div>
            ) : (
              <div className={styles.expenseList}>
                {sortedExpenses.map((expense) => {
                  const tx = txMap.get(expense.transactionId);
                  const cp = counterpartyMap.get(expense.counterpartyId);
                  const remaining = remainingAmount(expense, transfers);
                  const isSettling = settlingId === expense.id;
                  const isSettled = expense.status === 'settled';

                  return (
                    <div
                      key={expense.id}
                      className={`${styles.expenseItem} ${isSettled ? styles.expenseItemSettled : styles.expenseItemOpen}`}
                    >
                      <div className={styles.expenseHeader}>
                        <span className={styles.expenseTitle}>{tx?.title ?? '(삭제된 거래)'}</span>
                        <span
                          className={styles.statusBadge}
                          style={{ color: statusColor(expense.status) }}
                        >
                          {statusLabel(expense.status)}
                        </span>
                      </div>

                      <div className={styles.expenseAmounts}>
                        <div className={styles.amountBlock}>
                          <span className={styles.amountLabel}>전체 금액</span>
                          <span className={styles.amountValue}>{fmt(tx?.amount ?? 0)}</span>
                        </div>
                        <div className={styles.amountBlock}>
                          <span className={styles.amountLabel}>내 부담</span>
                          <span className={styles.amountValue}>{fmt(expense.myShareAmount)}</span>
                        </div>
                        <div className={styles.amountBlock}>
                          <span className={styles.amountLabel}>{cp?.name ?? '상대방'} 부담</span>
                          <span className={styles.amountValue}>{fmt(expense.counterpartyShareAmount)}</span>
                        </div>
                      </div>

                      <div className={styles.expenseMeta}>
                        <span>{expense.paidBy === 'me' ? '내가 결제' : `${cp?.name ?? '상대방'} 결제`}</span>
                        {tx?.date && <span>{tx.date}</span>}
                        {cp && <span>상대: {cp.name}</span>}
                      </div>

                      {expense.status !== 'settled' && remaining > 0 && (
                        <div className={styles.settleRow}>
                          <span className={styles.remainingLabel}>
                            {expense.paidBy === 'me'
                              ? `${cp?.name ?? '상대방'}에게 받을 돈`
                              : `${cp?.name ?? '상대방'}에게 줄 돈`}:{' '}
                            <strong>{fmt(remaining)}</strong>
                          </span>
                          <button
                            className={styles.settleBtn}
                            onClick={() => handleSettle(expense)}
                            disabled={isSettling}
                            type="button"
                          >
                            {isSettling ? '처리 중…' : '정산 완료'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 정산 통계 카드 ── */}
          {sharedExpenses.length > 0 && (() => {
            const totalShared = sharedExpenses.reduce((s, e) => s + (txMap.get(e.transactionId)?.amount ?? 0), 0);
            const perPerson = sharedExpenses.length > 0
              ? Math.round(sharedExpenses.reduce((s, e) => s + e.myShareAmount, 0) / sharedExpenses.length)
              : 0;
            return (
              <div className={styles.statsCard}>
                <div className={styles.statsCardHeader}>
                  <span className={styles.statsCardTitle}>정산 통계</span>
                </div>
                <div className={styles.statsCardGrid}>
                  <div className={styles.statsCardItem}>
                    <span className={styles.statsItemLabel}>이번 달 공동지출 합계</span>
                    <span className={styles.statsItemValue}>{fmt(totalShared)}</span>
                  </div>
                  <div className={styles.statsCardItem}>
                    <span className={styles.statsItemLabel}>건당 평균 내 부담</span>
                    <span className={styles.statsItemValue}>{fmt(perPerson)}</span>
                  </div>
                  <div className={styles.statsCardItem}>
                    <span className={styles.statsItemLabel}>완료</span>
                    <span className={styles.statsItemValue} style={{ color: 'var(--safety-safe)' }}>
                      {settledCount}건
                    </span>
                  </div>
                  <div className={styles.statsCardItem}>
                    <span className={styles.statsItemLabel}>미완료</span>
                    <span className={styles.statsItemValue} style={{ color: openCount > 0 ? 'var(--safety-warning)' : 'var(--text-muted)' }}>
                      {openCount}건
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── 상대방 추가 BottomSheet ── */}
      <BottomSheet
        open={cpSheetOpen}
        onClose={() => { setCpSheetOpen(false); setCpName(''); setCpNameError(''); }}
        title="정산 상대 추가"
      >
        <div className={styles.cpForm}>
          <Input
            label="이름"
            value={cpName}
            onChange={(e) => { setCpName(e.target.value); setCpNameError(''); }}
            placeholder="예: 파트너, 친구"
            error={cpNameError}
          />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleAddCounterparty}
            loading={savingCp}
          >
            추가
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
