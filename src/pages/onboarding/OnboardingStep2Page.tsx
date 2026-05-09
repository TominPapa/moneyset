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
import styles from './OnboardingStep2Page.module.css';

const KIND_OPTIONS = [
  { value: 'checking', label: '입출금' },
  { value: 'savings', label: '적금' },
  { value: 'investment', label: '투자' },
];

const KIND_LABEL: Record<AccountKind, string> = {
  checking: '입출금',
  savings: '적금',
  investment: '투자',
};

interface AccountForm {
  name: string;
  kind: AccountKind;
  institution: string;
  balance: number;
}

const EMPTY_FORM: AccountForm = { name: '', kind: 'checking', institution: '', balance: 0 };

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
                  {KIND_LABEL[acc.kind]}
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
