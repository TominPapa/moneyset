// TransactionForm — 거래 입력/수정 폼 (BottomSheet 내부)

import { useState, useEffect } from 'react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import { localCache } from '../../storage/localCacheImpl';
import type {
  Transaction,
  EntryKind,
  Category,
  PaymentMethod,
  Counterparty,
  SplitMode,
  Account,
} from '../../domain/types';
import styles from './TransactionForm.module.css';

interface TransactionFormProps {
  initial?: Transaction;
  defaultDate?: string; // 신규 입력 시 날짜 pre-fill (initial 없을 때만 적용)
  ym: string;           // YYYY-MM
  minDate?: string;
  maxDate?: string;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  counterparties: Counterparty[];
  accounts: Account[];
  onSave: (
    tx: Transaction,
    counterpartyId?: string,
    splitMode?: SplitMode,
    myRatio?: number,
    myCustomAmount?: number
  ) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ymToDate(ym: string): string {
  return `${ym}-01`;
}
function ymLastDate(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
}

export function TransactionForm({
  initial,
  defaultDate,
  ym,
  minDate,
  maxDate,
  categories,
  paymentMethods,
  counterparties,
  accounts,
  onSave,
  onDelete,
}: TransactionFormProps) {
  const isEdit = !!initial?.id; // 진짜 ID가 있는 경우만 편집 모드

  const [entryKind, setEntryKind] = useState<EntryKind>(initial?.entryKind ?? 'expense');
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? todayDate());
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.paymentMethodId ?? '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? '');
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [isShared, setIsShared] = useState(initial?.isShared ?? false);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [myRatio, setMyRatio] = useState<number>(0.5);
  const [myCustomAmount, setMyCustomAmount] = useState<number>(0);

  // 기존 공동지출이 존재할 경우 상세 정보 로드
  useEffect(() => {
    if (initial?.sharedExpenseId) {
      localCache.getSharedExpenses(ym).then((expenses) => {
        const found = expenses.find((e) => e.id === initial.sharedExpenseId);
        if (found) {
          setIsShared(true);
          setCounterpartyId(found.counterpartyId);
          setSplitMode(found.splitMode);
          if (found.splitMode === 'ratio') {
            const calculatedRatio = initial.amount > 0 ? found.myShareAmount / initial.amount : 0.5;
            setMyRatio(Number(calculatedRatio.toFixed(2)));
          } else if (found.splitMode === 'custom_amount') {
            setMyCustomAmount(found.myShareAmount);
          }
        }
      });
    }
  }, [initial, ym]);

  const [titleError, setTitleError] = useState('');
  const [amountError, setAmountError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [counterpartyError, setCounterpartyError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // entryKind 변경 시 상태 및 카테고리 초기화
  useEffect(() => {
    if (!initial) setCategoryId('');
    if (entryKind !== 'expense') {
      setIsShared(false);
      setCounterpartyId('');
      setCounterpartyError('');
    }
  }, [entryKind, initial]);

  const filteredCategories = categories.filter(
    (c) => c.entryKind === (entryKind === 'transfer' ? 'expense' : entryKind),
  );

  const categoryOptions = filteredCategories.map((c) => ({
    value: c.id,
    label: `${c.icon ?? ''} ${c.name}`,
  }));

  const paymentOptions = [
    { value: '', label: '결제수단 없음' },
    ...paymentMethods
      .filter((pm) => pm.isActive)
      .map((pm) => ({ value: pm.id, label: pm.name })),
  ];

  const counterpartyOptions = counterparties.map((cp) => ({
    value: cp.id,
    label: cp.name,
  }));

  const handleSave = async () => {
    let hasError = false;
    if (!title.trim()) { setTitleError('제목을 입력해주세요.'); hasError = true; }
    if (amount <= 0) { setAmountError('금액을 입력해주세요.'); hasError = true; }
    if (!categoryId) { setCategoryError('카테고리를 선택해주세요.'); hasError = true; }

    if (isShared) {
      if (counterparties.length === 0) {
        setCounterpartyError('공동정산 상대방을 먼저 추가해주세요.');
        hasError = true;
      } else if (!counterpartyId) {
        setCounterpartyError('정산 상대방을 선택해주세요.');
        hasError = true;
      }
    }

    if (hasError) return;

    setSaving(true);
    const now = new Date().toISOString();
    const tx: Transaction = {
      id: initial?.id ?? `tx_${crypto.randomUUID()}`,
      ledgerMonth: ym,
      date,
      entryKind,
      title: title.trim(),
      amount,
      categoryId,
      paymentMethodId: paymentMethodId || undefined,
      accountId: accountId || undefined,
      memo: memo.trim() || undefined,
      isShared,
      sharedExpenseId: initial?.sharedExpenseId,
      tags: initial?.tags,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await onSave(
        tx,
        isShared && counterpartyId ? counterpartyId : undefined,
        isShared ? splitMode : undefined,
        isShared && splitMode === 'ratio' ? myRatio : undefined,
        isShared && splitMode === 'custom_amount' ? myCustomAmount : undefined
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !initial) return;
    setDeleting(true);
    try {
      await onDelete(initial.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={styles.form}>
      {/* 지출/수입 탭 */}
      <div className={styles.tabs} role="tablist">
        {(['expense', 'income'] as EntryKind[]).map((kind) => (
          <button
            key={kind}
            role="tab"
            aria-selected={entryKind === kind}
            className={[styles.tab, entryKind === kind ? styles.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setEntryKind(kind)}
            type="button"
          >
            {kind === 'expense' ? '지출' : '수입'}
          </button>
        ))}
      </div>

      {/* 날짜 */}
      <Input
        label="날짜"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        min={minDate ?? ymToDate(ym)}
        max={maxDate ?? ymLastDate(ym)}
      />

      {/* 금액 */}
      <AmountInput
        label="금액"
        value={amount}
        onChange={(v) => { setAmount(v); setAmountError(''); }}
        required
        error={amountError}
      />

      {/* 카테고리 */}
      <Select
        label="카테고리"
        value={categoryId}
        options={categoryOptions}
        placeholder="카테고리 선택"
        onChange={(e) => { setCategoryId(e.target.value); setCategoryError(''); }}
        error={categoryError}
      />

      {/* 제목 */}
      <Input
        label="제목"
        value={title}
        onChange={(e) => { setTitle(e.target.value); setTitleError(''); }}
        placeholder="예: 편의점, 카페 아메리카노"
        error={titleError}
      />

      {/* 결제수단 */}
      <Select
        label="결제수단 (선택)"
        value={paymentMethodId}
        options={paymentOptions}
        onChange={(e) => setPaymentMethodId(e.target.value)}
      />

      {/* 연결 계좌 */}
      <Select
        label="연결 계좌 (선택)"
        value={accountId}
        options={[
          { value: '', label: '계좌 선택 안함' },
          ...accounts
            .filter((a) => a.isActive)
            .map((a) => ({
              value: a.id,
              label: `${a.name}${a.isBudgetAccount ? ' (생활비)' : ''}`,
            })),
        ]}
        onChange={(e) => setAccountId(e.target.value)}
      />

      {/* 메모 */}
      <Input
        label="메모 (선택)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="추가 메모"
      />

      {/* 공동지출 토글 — 지출 항목에만 표시 */}
      {entryKind === 'expense' && (
        <div className={styles.sharedRow}>
          <button
            type="button"
            className={[styles.sharedToggle, isShared ? styles.sharedToggleOn : ''].filter(Boolean).join(' ')}
            onClick={() => {
              if (counterparties.length === 0) {
                alert('공동정산 메뉴에서 상대방을 먼저 등록하셔야 공동지출을 사용할 수 있습니다.');
                return;
              }
              setIsShared(!isShared);
              if (isShared) {
                setCounterpartyId('');
                setCounterpartyError('');
              }
            }}
            disabled={counterparties.length === 0}
            style={counterparties.length === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            <span className={styles.sharedIcon}>{isShared ? '✓' : ''}</span>
            공동지출
          </button>
          {isShared && counterparties.length > 0 && (
            <>
              <Select
                label="정산 상대방"
                value={counterpartyId}
                options={counterpartyOptions}
                placeholder="상대방 선택"
                onChange={(e) => {
                  setCounterpartyId(e.target.value);
                  setCounterpartyError('');
                }}
                error={counterpartyError}
              />
              <div className={styles.splitSection}>
                <label className={styles.formLabel} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>분담 방식</label>
                <div className={styles.splitTabs}>
                  {(['equal', 'ratio', 'custom_amount'] as SplitMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={[styles.splitTab, splitMode === mode ? styles.splitTabActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setSplitMode(mode)}
                    >
                      {mode === 'equal' ? '5:5 반반' : mode === 'ratio' ? '비율 지정' : '직접 입력'}
                    </button>
                  ))}
                </div>

                {splitMode === 'ratio' && (
                  <div className={styles.ratioWrapper}>
                    <div className={styles.ratioLabels}>
                      <span>내 비율: <strong>{Math.round(myRatio * 10)}</strong></span>
                      <span>상대 비율: <strong>{Math.round((1 - myRatio) * 10)}</strong></span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.1"
                      value={myRatio}
                      className={styles.slider}
                      onChange={(e) => setMyRatio(Number(e.target.value))}
                    />
                    <div className={styles.ratioHint}>
                      내 부담: {Math.round(amount * myRatio).toLocaleString()}원 | 상대 부담: {Math.round(amount * (1 - myRatio)).toLocaleString()}원
                    </div>
                  </div>
                )}

                {splitMode === 'custom_amount' && (
                  <div className={styles.customAmountField}>
                    <AmountInput
                      label="내 부담 금액"
                      value={myCustomAmount}
                      onChange={(v) => {
                        setMyCustomAmount(v);
                        if (v > amount) {
                          setMyCustomAmount(amount);
                        }
                      }}
                    />
                    <div className={styles.ratioHint}>
                      상대 부담액: {Math.max(0, amount - myCustomAmount).toLocaleString()}원
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
          {isShared && counterparties.length === 0 && (
            <p className={styles.sharedHint}>공동정산 탭에서 상대방을 먼저 추가해주세요.</p>
          )}
        </div>
      )}

      {/* 저장 버튼 */}
      <div className={styles.actions}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSave}
          loading={saving}
        >
          {isEdit ? '수정' : '저장'}
        </Button>

        {isEdit && onDelete && !showDeleteConfirm && (
          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => setShowDeleteConfirm(true)}
          >
            삭제
          </Button>
        )}

        {showDeleteConfirm && (
          <div className={styles.deleteConfirm}>
            <p className={styles.deleteMsg}>정말 삭제하시겠어요?</p>
            <div className={styles.deleteButtons}>
              <Button
                variant="danger"
                size="md"
                onClick={handleDelete}
                loading={deleting}
              >
                삭제
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setShowDeleteConfirm(false)}
              >
                취소
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
