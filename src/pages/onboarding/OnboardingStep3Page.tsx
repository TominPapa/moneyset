// OnboardingStep3Page — 고정지출/부채 등록

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { OnboardingLayout } from './OnboardingLayout';
import { useOnboarding } from './OnboardingContext';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import type { Liability, LiabilityKind } from '../../domain/types';
import { defaultCategories } from '../../domain/fixtures';
import styles from './OnboardingStep3Page.module.css';

const KIND_OPTIONS = [
  { value: 'loan', label: '대출상환' },
  { value: 'installment', label: '할부' },
  { value: 'rent', label: '월세/임대료' },
  { value: 'credit_card_recurring', label: '카드대금' },
];

const KIND_LABEL: Record<LiabilityKind, string> = {
  loan: '대출상환',
  installment: '할부',
  rent: '월세/임대료',
  credit_card_recurring: '카드대금',
};

const REQUIRED_CATEGORIES = defaultCategories
  .filter((c) => c.budgetGroup === 'required')
  .map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.name}` }));

const DUEDAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}일`,
}));

interface LiabilityForm {
  name: string;
  kind: LiabilityKind;
  categoryId: string;
  monthlyAmount: number;
  dueDay: number;
  totalBalance: number;
  remainingMonths: number;
}

const EMPTY_FORM: LiabilityForm = {
  name: '',
  kind: 'rent',
  categoryId: 'cat_rent',
  monthlyAmount: 0,
  dueDay: 25,
  totalBalance: 0,
  remainingMonths: 0,
};

export function OnboardingStep3Page() {
  const navigate = useNavigate();
  const { draft, addLiability, removeLiability } = useOnboarding();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<LiabilityForm>(EMPTY_FORM);
  const [nameError, setNameError] = useState('');
  const [amountError, setAmountError] = useState('');

  const openSheet = () => {
    setForm(EMPTY_FORM);
    setNameError('');
    setAmountError('');
    setSheetOpen(true);
  };

  const handleSave = () => {
    let hasError = false;
    if (!form.name.trim()) { setNameError('이름을 입력해주세요.'); hasError = true; }
    if (form.monthlyAmount <= 0) { setAmountError('0보다 큰 금액을 입력해주세요.'); hasError = true; }
    if (hasError) return;

    const now = new Date().toISOString();
    const liability: Liability = {
      id: `liab_${crypto.randomUUID()}`,
      name: form.name.trim(),
      kind: form.kind,
      categoryId: form.categoryId,
      monthlyAmount: form.monthlyAmount,
      dueDay: form.dueDay,
      totalBalance: form.totalBalance > 0 ? form.totalBalance : undefined,
      remainingMonths: form.remainingMonths > 0 ? form.remainingMonths : undefined,
      isActive: true,
      autoFixedExpense: true,
      createdAt: now,
      updatedAt: now,
    };
    addLiability(liability);
    setSheetOpen(false);
  };

  const totalMonthly = draft.liabilities.reduce((sum, l) => sum + l.monthlyAmount, 0);

  return (
    <OnboardingLayout
      step={3}
      title="고정지출 등록"
      subtitle="매달 반복되는 고정 지출 항목을 등록해주세요."
      footer={
        <>
          <Button variant="primary" size="lg" fullWidth onClick={() => navigate(ROUTES.onboardingStep4)}>
            다음 →
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={() => navigate(ROUTES.onboardingStep4)}>
            건너뛰기
          </Button>
        </>
      }
    >
      {/* 고정지출 합계 */}
      {draft.liabilities.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.summaryLabel}>월 고정지출 합계</span>
          <span className={styles.summaryAmount}>
            {totalMonthly.toLocaleString('ko-KR')}원
          </span>
        </div>
      )}

      {/* 목록 */}
      {draft.liabilities.length > 0 && (
        <ul className={styles.list}>
          {draft.liabilities.map((l) => (
            <li key={l.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{l.name}</span>
                <span className={styles.itemMeta}>
                  {KIND_LABEL[l.kind]} · {l.dueDay}일
                </span>
              </div>
              <div className={styles.itemRight}>
                <span className={styles.itemAmount}>
                  {l.monthlyAmount.toLocaleString('ko-KR')}원
                </span>
                <button
                  className={styles.removeBtn}
                  onClick={() => removeLiability(l.id)}
                  type="button"
                  aria-label="삭제"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" size="md" fullWidth onClick={openSheet}>
        + 고정지출 추가
      </Button>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="고정지출 추가">
        <div className={styles.formStack}>
          <Input
            label="이름"
            value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(''); }}
            placeholder="예: 월세, 카카오뱅크 대출"
            error={nameError}
          />
          <Select
            label="종류"
            value={form.kind}
            options={KIND_OPTIONS}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as LiabilityKind }))}
          />
          <Select
            label="카테고리"
            value={form.categoryId}
            options={REQUIRED_CATEGORIES}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
          />
          <AmountInput
            label="월 납입금액"
            value={form.monthlyAmount}
            onChange={(v) => { setForm((f) => ({ ...f, monthlyAmount: v })); setAmountError(''); }}
            required
            error={amountError}
          />
          <Select
            label="납입일"
            value={form.dueDay}
            options={DUEDAY_OPTIONS}
            onChange={(e) => setForm((f) => ({ ...f, dueDay: Number(e.target.value) }))}
          />
          <AmountInput
            label="남은 원금 (선택)"
            value={form.totalBalance}
            onChange={(v) => setForm((f) => ({ ...f, totalBalance: v }))}
            hint="대출/할부인 경우 입력"
          />
          <Button variant="primary" size="lg" fullWidth onClick={handleSave}>
            추가
          </Button>
        </div>
      </BottomSheet>
    </OnboardingLayout>
  );
}
