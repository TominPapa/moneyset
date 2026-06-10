// OnboardingStep2Page — 자산 등록

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
import type { Account, AccountKind } from '../../domain/types';
import { DUE_DAY_OPTIONS, formatDueDay } from '../../domain/dueDay';
import styles from './OnboardingStep2Page.module.css';

const KIND_OPTIONS = [
  { value: 'checking', label: '입출금' },
  { value: 'savings', label: '적금' },
  { value: 'investment', label: '투자' },
  { value: 'insurance', label: '저축형 보험' },
];

const KIND_LABEL: Record<AccountKind, string> = {
  checking: '입출금',
  savings: '적금',
  investment: '투자',
  insurance: '저축형 보험',
};

interface AccountForm {
  name: string;
  kind: AccountKind;
  institution: string;
  balance: number;
  insurancePeriodYears?: number;
  insurancePaidMonths?: number;
  insuranceDueDay?: number;
  insuranceMonthlyAmount?: number;
}

const EMPTY_FORM: AccountForm = {
  name: '',
  kind: 'checking',
  institution: '',
  balance: 0,
  insurancePeriodYears: undefined,
  insurancePaidMonths: undefined,
  insuranceDueDay: 25,
  insuranceMonthlyAmount: undefined,
};

export function OnboardingStep2Page() {
  const navigate = useNavigate();
  const { draft, addAccount, removeAccount } = useOnboarding();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [nameError, setNameError] = useState('');

  const openSheet = () => {
    setForm(EMPTY_FORM);
    setNameError('');
    setSheetOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      setNameError('계좌 이름을 입력해주세요.');
      return;
    }
    const now = new Date().toISOString();
    const account: Account = {
      id: `acc_${crypto.randomUUID()}`,
      name: form.name.trim(),
      kind: form.kind,
      institution: form.institution.trim() || undefined,
      balance: form.balance,
      isActive: true,
      sortOrder: draft.accounts.length + 1,
      lastUpdatedAt: now,
      createdAt: now,
      ...(form.kind === 'insurance' ? {
        insurancePeriodYears: form.insurancePeriodYears,
        insurancePaidMonths: form.insurancePaidMonths,
        insuranceDueDay: form.insuranceDueDay,
        insuranceMonthlyAmount: form.insuranceMonthlyAmount,
      } : {}),
    };
    addAccount(account);
    setSheetOpen(false);
  };

  const totalBalance = draft.accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <OnboardingLayout
      step={2}
      title="자산 등록"
      subtitle="보유 계좌와 잔액을 입력해주세요. 나중에 수정할 수 있습니다."
      footer={
        <>
          <Button variant="primary" size="lg" fullWidth onClick={() => navigate(ROUTES.onboardingStep3)}>
            다음 →
          </Button>
          <Button variant="ghost" size="md" fullWidth onClick={() => navigate(ROUTES.onboardingStep3)}>
            건너뛰기
          </Button>
        </>
      }
    >
      {/* 총 자산 요약 */}
      {draft.accounts.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.summaryLabel}>총 자산</span>
          <span className={styles.summaryAmount}>
            {totalBalance.toLocaleString('ko-KR')}원
          </span>
        </div>
      )}

      {/* 계좌 목록 */}
      {draft.accounts.length > 0 && (
        <ul className={styles.list}>
          {draft.accounts.map((acc) => (
            <li key={acc.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{acc.name}</span>
                <span className={styles.itemMeta}>
                  {acc.kind === 'insurance'
                    ? `저축형 보험 · ${acc.insurancePaidMonths ?? 0}개월 납입 (${acc.insurancePeriodYears ?? 0}년 납) · 매달 ${formatDueDay(acc.insuranceDueDay ?? 25)}`
                    : KIND_LABEL[acc.kind]}
                  {acc.institution ? ` · ${acc.institution}` : ''}
                </span>
              </div>
              <div className={styles.itemRight}>
                <span className={styles.itemBalance}>
                  {acc.balance.toLocaleString('ko-KR')}원
                </span>
                <button
                  className={styles.removeBtn}
                  onClick={() => removeAccount(acc.id)}
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

      {/* 추가 버튼 */}
      <Button variant="secondary" size="md" fullWidth onClick={openSheet}>
        + 계좌 추가
      </Button>

      {/* 추가 BottomSheet */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="계좌 추가">
        <div className={styles.formStack}>
          <Input
            label="계좌 이름"
            value={form.name}
            onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameError(''); }}
            placeholder="예: 카카오뱅크 생활비"
            error={nameError}
          />
          <Select
            label="종류"
            value={form.kind}
            options={KIND_OPTIONS}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as AccountKind }))}
          />
          <Input
            label="기관명 (선택)"
            value={form.institution}
            onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))}
            placeholder="예: 카카오뱅크"
          />
          {form.kind === 'insurance' && (
            <>
              <div className={styles.formField}>
                <label className={styles.formLabel}>납입 기간 (년)</label>
                <input
                  type="number"
                  className={styles.numberInput}
                  value={form.insurancePeriodYears ?? ''}
                  min={1}
                  placeholder="예: 10"
                  onChange={(e) => setForm((f) => ({ ...f, insurancePeriodYears: e.target.value ? Number(e.target.value) : undefined }))}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>현재 납입 횟수 (개월)</label>
                <input
                  type="number"
                  className={styles.numberInput}
                  value={form.insurancePaidMonths ?? ''}
                  min={0}
                  placeholder="예: 24"
                  onChange={(e) => {
                    const months = e.target.value ? Number(e.target.value) : 0;
                    setForm((f) => {
                      const next = { ...f, insurancePaidMonths: months };
                      next.balance = (f.insuranceMonthlyAmount ?? 0) * months;
                      return next;
                    });
                  }}
                />
              </div>
              <Select
                label="매달 납입일"
                value={String(form.insuranceDueDay ?? 25)}
                options={DUE_DAY_OPTIONS}
                onChange={(e) => setForm((f) => ({ ...f, insuranceDueDay: Number(e.target.value) }))}
              />
              <AmountInput
                label="월 납입금액"
                value={form.insuranceMonthlyAmount ?? 0}
                onChange={(v) => {
                  setForm((f) => {
                    const next = { ...f, insuranceMonthlyAmount: v };
                    next.balance = v * (f.insurancePaidMonths ?? 0);
                    return next;
                  });
                }}
              />
              {form.insuranceMonthlyAmount !== undefined && form.insurancePaidMonths !== undefined && (
                <div style={{ fontSize: '11px', color: 'var(--accent-1)', marginTop: '-8px' }}>
                  * 월 납입금액과 납입 횟수를 바탕으로 현재 잔액이 자동 계산되었습니다. 필요 시 아래 현재 잔액을 직접 수정하세요.
                </div>
              )}
            </>
          )}
          <AmountInput
            label="현재 잔액"
            value={form.balance}
            onChange={(v) => setForm((f) => ({ ...f, balance: v }))}
          />
          <Button variant="primary" size="lg" fullWidth onClick={handleSave}>
            추가
          </Button>
        </div>
      </BottomSheet>
    </OnboardingLayout>
  );
}
