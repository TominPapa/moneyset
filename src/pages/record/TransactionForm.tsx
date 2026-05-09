// TransactionForm — 거래 입력/수정 폼 (BottomSheet 내부)

import { useState, useEffect } from 'react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import type {
  Transaction,
  EntryKind,
  Category,
  PaymentMethod,
  Counterparty,
} from '../../domain/types';
import styles from './TransactionForm.module.css';

interface TransactionFormProps {
  initial?: Transaction;
  defaultDate?: string; // 신규 입력 시 날짜 pre-fill (initial 없을 때만 적용)
  ym: string;           // YYYY-MM
  categories: Category[];
  paymentMethods: PaymentMethod[];
  counterparties: Counterparty[];
  onSave: (tx: Transaction, counterpartyId?: string) => Promise<void>;
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
  categories,
  paymentMethods,
  counterparties,
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
  const [memo, setMemo] = useState(initial?.memo ?? '');
  const [isShared, setIsShared] = useState(initial?.isShared ?? false);
  const [counterpartyId, setCounterpartyId] = useState('');

  const [titleError, setTitleError] = useState('');
  const [amountError, setAmountError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // entryKind 변경 시 카테고리 초기화
  useEffect(() => {
    if (!initial) setCategoryId('');
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
      memo: memo.trim() || undefined,
      isShared,
      sharedExpenseId: initial?.sharedExpenseId,
      tags: initial?.tags,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await onSave(tx, isShared && counterpartyId ? counterpartyId : undefined);
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
        min={ymToDate(ym)}
        max={ymLastDate(ym)}
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
            onClick={() => { setIsShared(!isShared); if (isShared) setCounterpartyId(''); }}
          >
            <span className={styles.sharedIcon}>{isShared ? '✓' : ''}</span>
            공동지출
          </button>
          {isShared && counterparties.length > 0 && (
            <Select
              label=""
              value={counterpartyId}
              options={counterpartyOptions}
              placeholder="상대방 선택"
              onChange={(e) => setCounterpartyId(e.target.value)}
            />
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
