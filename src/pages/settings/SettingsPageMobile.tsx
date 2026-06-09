// SettingsPageMobile — 모바일 전용 설정 화면
// iOS/Android 스타일 1열 리스트 메뉴, 상세 설정 풀스크린 시트, 큼직한 터치 토글/슬라이더, 개발자 도구 탑재

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store/appStore';
import { localCache } from '../../storage/localCacheImpl';
import { driveAdapter } from '../../storage/driveAdapterImpl';
import { tierLabel, tierColor } from '../../domain/tiers';
import { ROUTES } from '../../app/routes';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import type {
  AppConfig,
  ThemeMode,
  Category,
  Account,
  AccountKind,
  Liability,
  LiabilityKind,
  RepaymentType,
} from '../../domain/types';
import { insertSeedData, clearSeedData } from '../../dev/seedData';
import { listBackups, saveSnapshotNow, restoreSnapshot } from '../../storage/backupService';
import type { BackupMeta } from '../../storage/backupService';
import styles from './SettingsPageMobile.module.css';

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

function fmt(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

type Tab = 'general' | 'categories' | 'assets' | 'data';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'general',    label: '일반',     icon: '⚙' },
  { key: 'categories', label: '카테고리', icon: '🏷' },
  { key: 'assets',     label: '자산·부채', icon: '🏦' },
  { key: 'data',       label: '데이터',   icon: '📊' },
];

function calcMonthlyPayment(
  principal: number,
  annualRate: number,
  months: number,
  type: RepaymentType,
): number {
  if (principal <= 0 || months <= 0) return 0;
  const rate = annualRate || 0;
  if (type === 'annuity') {
    if (!rate) return Math.round(principal / months);
    const r = rate / 100 / 12;
    return Math.round(principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1));
  }
  if (type === 'equal_principal') {
    const r = rate / 100 / 12;
    return Math.round(principal / months + principal * r);
  }
  if (type === 'bullet') {
    const r = rate / 100 / 12;
    return Math.round(principal * r);
  }
  return 0;
}

const GROUP_LABELS: Record<string, string> = {
  living:   '생활비',
  required: '필수지출',
  excluded: '제외',
};

const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking:   '입출금',
  savings:    '적금/저축',
  investment: '투자',
  insurance:  '저축형 보험',
};

const LIABILITY_KIND_LABELS: Record<LiabilityKind, string> = {
  loan:                  '대출',
  installment:           '할부',
  rent:                  '월세',
  credit_card_recurring: '카드대금',
};

const EXPENSE_ICONS = [
  '🍜','🍕','🛒','🏠','🚗','💊','📚','🎮','👗','☕',
  '🎬','🏋️','✈️','💻','📱','🐕','🎵','🛍️','💳','🎁',
  '🚇','⚡','💡','🏥','🎓','🧴','🍺','🥗','💸','🏪',
];
const INCOME_ICONS = [
  '💰','💵','🏦','📈','💼','🎁','🏆','💎','🌟','✨','🤝','🎯',
];

function emptyCategory(entryKind: 'expense' | 'income', maxOrder: number): Category {
  return {
    id: '',
    name: '',
    entryKind,
    budgetGroup: entryKind === 'income' ? 'excluded' : 'living',
    icon: entryKind === 'income' ? '💰' : '💸',
    sortOrder: maxOrder + 1,
  };
}

function emptyAccount(): Account {
  const now = new Date().toISOString();
  return {
    id: '', name: '', kind: 'checking', institution: '',
    balance: 0, isActive: true, isBudgetAccount: false, sortOrder: 0,
    lastUpdatedAt: now, createdAt: now,
  };
}

function emptyLiability(): Liability {
  const now = new Date().toISOString();
  return {
    id: '', name: '', kind: 'loan', monthlyAmount: 0, dueDay: 25,
    totalBalance: undefined, remainingMonths: undefined,
    repaymentType: 'annuity', interestRate: undefined,
    categoryId: '', isActive: true, autoFixedExpense: true,
    createdAt: now, updatedAt: now,
  };
}

interface CategoryTabProps {
  config: AppConfig;
  onConfigChange: (c: AppConfig) => Promise<void>;
}

function CategoryTab({ config, onConfigChange }: CategoryTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing]     = useState<Category>(emptyCategory('expense', 0));
  const [saving, setSaving]       = useState(false);

  const expenseCats = config.categories
    .filter((c) => c.entryKind === 'expense')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const incomeCats = config.categories
    .filter((c) => c.entryKind === 'income')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  function openAdd(entryKind: 'expense' | 'income') {
    const maxOrder = Math.max(0, ...config.categories.map((c) => c.sortOrder));
    setEditing(emptyCategory(entryKind, maxOrder));
    setSheetOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing({ ...cat });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!editing.name.trim()) return;
    setSaving(true);
    try {
      const id = editing.id || `cat_${crypto.randomUUID()}`;
      const updated: Category = { ...editing, id };
      const newCats = editing.id
        ? config.categories.map((c) => (c.id === editing.id ? updated : c))
        : [...config.categories, updated];
      await onConfigChange({ ...config, categories: newCats });
      setSheetOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing.id) return;
    if (!window.confirm(`'${editing.name}' 카테고리를 삭제할까요?\n이 카테고리의 기존 거래는 '미분류'로 표시됩니다.`)) return;
    setSaving(true);
    try {
      await onConfigChange({ ...config, categories: config.categories.filter((c) => c.id !== editing.id) });
      setSheetOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function upd<K extends keyof Category>(key: K, val: Category[K]) {
    setEditing((prev) => ({ ...prev, [key]: val }));
  }

  const iconList = editing.entryKind === 'income' ? INCOME_ICONS : EXPENSE_ICONS;

  return (
    <div className={styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>지출 카테고리</span>
          <button className={styles.addBtn} onClick={() => openAdd('expense')} type="button">+ 추가</button>
        </div>
        <div className={styles.listCard}>
          {expenseCats.length === 0 && <p className={styles.emptyNote}>지출 카테고리가 없습니다</p>}
          {expenseCats.map((cat) => (
            <div
              key={cat.id}
              className={styles.listItem}
              onClick={() => openEdit(cat)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openEdit(cat)}
            >
              <span className={styles.listItemIcon}>{cat.icon ?? '📋'}</span>
              <div className={styles.listItemBody}>
                <span className={styles.listItemName}>{cat.name}</span>
                <span className={styles.listItemMeta}>{GROUP_LABELS[cat.budgetGroup] ?? cat.budgetGroup}</span>
              </div>
              <span className={styles.listItemArrow}>›</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>수입 카테고리</span>
          <button className={styles.addBtn} onClick={() => openAdd('income')} type="button">+ 추가</button>
        </div>
        <div className={styles.listCard}>
          {incomeCats.length === 0 && <p className={styles.emptyNote}>수입 카테고리가 없습니다</p>}
          {incomeCats.map((cat) => (
            <div
              key={cat.id}
              className={styles.listItem}
              onClick={() => openEdit(cat)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openEdit(cat)}
            >
              <span className={styles.listItemIcon}>{cat.icon ?? '💰'}</span>
              <div className={styles.listItemBody}>
                <span className={styles.listItemName}>{cat.name}</span>
                <span className={styles.listItemMeta}>수입</span>
              </div>
              <span className={styles.listItemArrow}>›</span>
            </div>
          ))}
        </div>
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing.id ? '카테고리 수정' : `${editing.entryKind === 'income' ? '수입' : '지출'} 카테고리 추가`}
      >
        <div className={styles.form}>
          <Input
            label="카테고리명"
            value={editing.name}
            onChange={(e) => upd('name', e.target.value)}
            placeholder="예: 식비"
            required
          />

          <div className={styles.formField}>
            <label className={styles.formLabel}>아이콘</label>
            <div className={styles.iconGrid}>
              {iconList.map((ic) => (
                <button
                  key={ic}
                  className={`${styles.iconBtn} ${editing.icon === ic ? styles.iconBtnActive : ''}`}
                  onClick={() => upd('icon', ic)}
                  type="button"
                >
                  {ic}
                </button>
              ))}
            </div>
            <input
              className={styles.iconInput}
              type="text"
              value={editing.icon ?? ''}
              onChange={(e) => upd('icon', e.target.value)}
              placeholder="직접 입력 (이모지 붙여넣기 가능)"
              maxLength={4}
            />
          </div>

          {editing.entryKind === 'expense' && (
            <div className={styles.formField}>
              <label className={styles.formLabel}>예산 그룹</label>
              <Select
                value={editing.budgetGroup}
                onChange={(e) => upd('budgetGroup', e.target.value as Category['budgetGroup'])}
                options={[
                  { value: 'living',   label: '생활비 — 예산 한도에 포함' },
                  { value: 'required', label: '필수지출 — 고정비용으로 분류' },
                  { value: 'excluded', label: '제외 — 통계·예산 계산에서 제외' },
                ]}
              />
            </div>
          )}

          <div className={styles.formActions}>
            <Button variant="primary" onClick={handleSave} disabled={saving}>저장</Button>
            {editing.id && (
              <Button variant="danger" onClick={handleDelete} disabled={saving}>삭제</Button>
            )}
            <Button variant="ghost" onClick={() => setSheetOpen(false)}>취소</Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

interface AssetsTabProps {
  accounts: Account[];
  liabilities: Liability[];
  onAccountsChange: (list: Account[]) => Promise<void>;
  onLiabilitiesChange: (list: Liability[]) => Promise<void>;
}

function AssetsTab({ accounts, liabilities, onAccountsChange, onLiabilitiesChange }: AssetsTabProps) {
  const [accSheet, setAccSheet]     = useState(false);
  const [editAcc, setEditAcc]       = useState<Account>(emptyAccount());
  const [accSaving, setAccSaving]   = useState(false);
  const [liabSheet, setLiabSheet]   = useState(false);
  const [editLiab, setEditLiab]     = useState<Liability>(emptyLiability());
  const [liabSaving, setLiabSaving] = useState(false);

  const totalAssets = accounts.filter((a) => a.isActive).reduce((s, a) => s + a.balance, 0);
  const totalLiab   = liabilities.filter((l) => l.isActive).reduce((s, l) => s + (l.totalBalance ?? 0), 0);

  function openAddAcc() { setEditAcc({ ...emptyAccount(), sortOrder: accounts.length }); setAccSheet(true); }
  function openEditAcc(a: Account) { setEditAcc({ ...a }); setAccSheet(true); }

  async function saveAccount() {
    if (!editAcc.name.trim()) return;
    setAccSaving(true);
    try {
      const now = new Date().toISOString();
      const id = editAcc.id || `acc_${crypto.randomUUID()}`;
      const updated: Account = { ...editAcc, id, lastUpdatedAt: now, createdAt: editAcc.id ? editAcc.createdAt : now };
      const list = editAcc.id ? accounts.map((a) => (a.id === editAcc.id ? updated : a)) : [...accounts, updated];
      await onAccountsChange(list);
      setAccSheet(false);
    } catch (err) {
      console.error('Failed to save account:', err);
      alert('계좌 정보를 저장하지 못했습니다. 구글 드라이브 연결 상태를 확인한 후 다시 시도해주세요.');
    } finally { setAccSaving(false); }
  }

  async function deleteAccount() {
    if (!editAcc.id || !window.confirm(`'${editAcc.name}' 계좌를 삭제할까요?`)) return;
    setAccSaving(true);
    try {
      await onAccountsChange(accounts.filter((a) => a.id !== editAcc.id));
      setAccSheet(false);
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert('계좌를 삭제하지 못했습니다. 구글 드라이브 연결 상태를 확인한 후 다시 시도해주세요.');
    } finally { setAccSaving(false); }
  }

  function openAddLiab() { setEditLiab(emptyLiability()); setLiabSheet(true); }
  function openEditLiab(l: Liability) { setEditLiab({ ...l }); setLiabSheet(true); }

  async function saveLiability() {
    if (!editLiab.name.trim()) return;
    if (editLiab.repaymentType === 'bullet' && !(editLiab.remainingMonths && editLiab.remainingMonths > 0)) {
      alert('만기일시상환은 잔여 개월 수 입력이 필수입니다.');
      return;
    }
    const canAutoSave = !!editLiab.repaymentType &&
      (editLiab.totalBalance ?? 0) > 0 &&
      (editLiab.remainingMonths ?? 0) > 0 &&
      !(editLiab.repaymentType === 'bullet' && !editLiab.interestRate);
    const autoAmt = canAutoSave
      ? calcMonthlyPayment(editLiab.totalBalance!, editLiab.interestRate ?? 0, editLiab.remainingMonths!, editLiab.repaymentType!)
      : null;
    const finalMonthly = autoAmt ?? editLiab.monthlyAmount;
    if (finalMonthly <= 0) {
      alert('월 납입 금액 또는 납부 의무 금액은 0원보다 커야 합니다.');
      return;
    }
    setLiabSaving(true);
    try {
      const now = new Date().toISOString();
      const id = editLiab.id || `liab_${crypto.randomUUID()}`;
      const updated: Liability = { ...editLiab, id, monthlyAmount: finalMonthly, updatedAt: now, createdAt: editLiab.id ? editLiab.createdAt : now };
      const list = editLiab.id ? liabilities.map((l) => (l.id === editLiab.id ? updated : l)) : [...liabilities, updated];
      await onLiabilitiesChange(list);
      setLiabSheet(false);
    } catch (err) {
      console.error('Failed to save liability:', err);
      alert('부채 정보를 저장하지 못했습니다. 구글 드라이브 연결 상태를 확인한 후 다시 시도해주세요.');
    } finally { setLiabSaving(false); }
  }

  async function deleteLiability() {
    if (!editLiab.id || !window.confirm(`'${editLiab.name}'을 삭제할까요?`)) return;
    setLiabSaving(true);
    try {
      await onLiabilitiesChange(liabilities.filter((l) => l.id !== editLiab.id));
      setLiabSheet(false);
    } catch (err) {
      console.error('Failed to delete liability:', err);
      alert('부채를 삭제하지 못했습니다. 구글 드라이브 연결 상태를 확인한 후 다시 시도해주세요.');
    } finally { setLiabSaving(false); }
  }

  function updAcc<K extends keyof Account>(k: K, v: Account[K]) { setEditAcc((p) => ({ ...p, [k]: v })); }
  function updLiab<K extends keyof Liability>(k: K, v: Liability[K]) { setEditLiab((p) => ({ ...p, [k]: v })); }

  return (
    <div className={styles.tabContent}>
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>총 자산</span>
          <span className={styles.summaryValue} style={{ color: 'var(--mint-400)' }}>{fmt(totalAssets)}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>총 부채</span>
          <span className={styles.summaryValue} style={{ color: 'var(--danger)' }}>{fmt(totalLiab)}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>순자산</span>
          <span
            className={styles.summaryValue}
            style={{ color: totalAssets - totalLiab >= 0 ? 'var(--text-1)' : 'var(--danger)' }}
          >
            {fmt(totalAssets - totalLiab)}
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>자산 계좌</span>
          <button className={styles.addBtn} onClick={openAddAcc} type="button">+ 추가</button>
        </div>
        <div className={styles.listCard}>
          {accounts.length === 0 && <p className={styles.emptyNote}>등록된 계좌가 없습니다</p>}
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className={styles.listItem}
              onClick={() => openEditAcc(acc)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openEditAcc(acc)}
            >
              <span className={styles.listItemIcon}>
                {acc.kind === 'investment' ? '📈' : acc.kind === 'savings' ? '🏦' : acc.kind === 'insurance' ? '🛡️' : '💳'}
              </span>
              <div className={styles.listItemBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={styles.listItemName}>{acc.name}</span>
                  {acc.isBudgetAccount && (
                    <span style={{ fontSize: 10, background: 'rgba(63,214,164,0.15)', color: 'var(--mint-300)', padding: '2px 6px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      생활비
                    </span>
                  )}
                </div>
                <span className={styles.listItemMeta}>
                  {acc.kind === 'insurance'
                    ? `저축형 보험 · ${acc.insurancePaidMonths ?? 0}개월 납입 (${acc.insurancePeriodYears ?? 0}년 납) · 매달 ${acc.insuranceDueDay ?? 25}일`
                    : ACCOUNT_KIND_LABELS[acc.kind]}
                  {acc.institution ? ` · ${acc.institution}` : ''}
                </span>
              </div>
              <span className={styles.listItemAmount}>{fmt(acc.balance)}</span>
              <span className={styles.listItemArrow}>›</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>부채 / 고정의무</span>
          <button className={styles.addBtn} onClick={openAddLiab} type="button">+ 추가</button>
        </div>
        <div className={styles.listCard}>
          {liabilities.length === 0 && <p className={styles.emptyNote}>등록된 부채가 없습니다</p>}
          {liabilities.map((l) => (
            <div
              key={l.id}
              className={styles.listItem}
              onClick={() => openEditLiab(l)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openEditLiab(l)}
            >
              <span className={styles.listItemIcon}>🔴</span>
              <div className={styles.listItemBody}>
                <span className={styles.listItemName}>{l.name}</span>
                <span className={styles.listItemMeta}>
                  {LIABILITY_KIND_LABELS[l.kind]} · 월 {fmt(l.monthlyAmount)}
                  {l.remainingMonths ? ` · 잔여 ${l.remainingMonths}개월` : ''}
                </span>
              </div>
              {l.totalBalance !== undefined && (
                <span className={styles.listItemAmount} style={{ color: 'var(--danger)' }}>{fmt(l.totalBalance)}</span>
              )}
              <span className={styles.listItemArrow}>›</span>
            </div>
          ))}
        </div>
      </div>

      {/* 계좌 편집 Sheet */}
      <BottomSheet open={accSheet} onClose={() => setAccSheet(false)} title={editAcc.id ? '계좌 수정' : '계좌 추가'}>
        <div className={styles.form}>
          <Input
            label="계좌명"
            value={editAcc.name}
            onChange={(e) => updAcc('name', e.target.value)}
            placeholder="예: 카카오뱅크 입출금"
            required
          />
          <div className={styles.formField}>
            <label className={styles.formLabel}>종류</label>
            <Select
              value={editAcc.kind}
              onChange={(e) => updAcc('kind', e.target.value as AccountKind)}
              options={[
                { value: 'checking',   label: '입출금' },
                { value: 'savings',    label: '적금/저축' },
                { value: 'investment', label: '투자' },
                { value: 'insurance',  label: '저축형 보험' },
              ]}
            />
          </div>
          <Input
            label="금융기관 (선택)"
            value={editAcc.institution ?? ''}
            onChange={(e) => updAcc('institution', e.target.value)}
            placeholder="예: 카카오뱅크"
          />
          {editAcc.kind === 'insurance' && (
            <>
              <div className={styles.formField}>
                <label className={styles.formLabel}>납입 기간 (년)</label>
                <input
                  type="number"
                  className={styles.numberInput}
                  value={editAcc.insurancePeriodYears ?? ''}
                  min={1}
                  placeholder="예: 10"
                  onChange={(e) => updAcc('insurancePeriodYears', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>현재 납입 횟수 (개월)</label>
                <input
                  type="number"
                  className={styles.numberInput}
                  value={editAcc.insurancePaidMonths ?? ''}
                  min={0}
                  placeholder="예: 24"
                  onChange={(e) => {
                    const months = e.target.value ? Number(e.target.value) : 0;
                    setEditAcc((p) => {
                      const next = { ...p, insurancePaidMonths: months };
                      next.balance = (p.insuranceMonthlyAmount ?? 0) * months;
                      return next;
                    });
                  }}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>매달 납입일</label>
                <Select
                  value={String(editAcc.insuranceDueDay ?? 25)}
                  onChange={(e) => updAcc('insuranceDueDay', Number(e.target.value))}
                  options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}일` }))}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>월 납입금액</label>
                <AmountInput
                  value={editAcc.insuranceMonthlyAmount ?? 0}
                  onChange={(v) => {
                    setEditAcc((p) => {
                      const next = { ...p, insuranceMonthlyAmount: v };
                      next.balance = v * (p.insurancePaidMonths ?? 0);
                      return next;
                    });
                  }}
                  placeholder="0"
                />
              </div>
              {editAcc.insuranceMonthlyAmount !== undefined && editAcc.insurancePaidMonths !== undefined && (
                <div style={{ fontSize: '11px', color: 'var(--accent-1)', marginTop: '-8px' }}>
                  * 월 납입금액과 납입 횟수를 바탕으로 현재 잔액이 자동 계산되었습니다. 필요 시 아래 현재 잔액을 직접 수정하세요.
                </div>
              )}
            </>
          )}
          <div className={styles.formField}>
            <label className={styles.formLabel}>현재 잔액</label>
            <AmountInput value={editAcc.balance} onChange={(v) => updAcc('balance', v)} placeholder="0" />
          </div>
          <div className={styles.formField} style={{ marginTop: 'var(--space-xs)' }}>
            <label className={styles.formLabel} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={editAcc.isBudgetAccount ?? false}
                onChange={(e) => updAcc('isBudgetAccount', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--mint-500)', cursor: 'pointer' }}
              />
              <span>이 계좌를 생활비 통장으로 사용</span>
            </label>
          </div>
          <div className={styles.formActions}>
            <Button variant="primary" onClick={saveAccount} disabled={accSaving}>저장</Button>
            {editAcc.id && <Button variant="danger" onClick={deleteAccount} disabled={accSaving}>삭제</Button>}
            <Button variant="ghost" onClick={() => setAccSheet(false)}>취소</Button>
          </div>
        </div>
      </BottomSheet>

      {/* 부채 편집 Sheet */}
      <BottomSheet open={liabSheet} onClose={() => setLiabSheet(false)} title={editLiab.id ? '부채 수정' : '부채 추가'}>
        {(() => {
          const canAutoCalc = !!editLiab.repaymentType &&
            (editLiab.totalBalance ?? 0) > 0 &&
            (editLiab.remainingMonths ?? 0) > 0 &&
            !(editLiab.repaymentType === 'bullet' && !editLiab.interestRate);
          const autoMonthly = canAutoCalc
            ? calcMonthlyPayment(editLiab.totalBalance!, editLiab.interestRate ?? 0, editLiab.remainingMonths!, editLiab.repaymentType!)
            : null;
          return (
            <div className={styles.form}>
              <Input
                label="이름"
                value={editLiab.name}
                onChange={(e) => updLiab('name', e.target.value)}
                placeholder="예: 신한은행 주택대출"
                required
              />
              <div className={styles.formField}>
                <label className={styles.formLabel}>종류</label>
                <Select
                  value={editLiab.kind}
                  onChange={(e) => updLiab('kind', e.target.value as LiabilityKind)}
                  options={[
                    { value: 'loan',                  label: '대출' },
                    { value: 'installment',           label: '할부' },
                    { value: 'rent',                  label: '월세' },
                    { value: 'credit_card_recurring', label: '카드대금' },
                  ]}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>상환 방식</label>
                <Select
                  value={editLiab.repaymentType ?? ''}
                  onChange={(e) => updLiab('repaymentType', e.target.value ? e.target.value as RepaymentType : undefined)}
                  options={[
                    { value: '',                label: '선택 안함 (직접 입력)' },
                    { value: 'annuity',         label: '원리금균등상환 — 매달 동일 금액' },
                    { value: 'equal_principal', label: '원금균등상환 — 원금 고정 + 이자 감소' },
                    { value: 'bullet',          label: '만기일시상환 — 이자만 납부 후 원금 일괄' },
                  ]}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>연이율 (%)</label>
                <input
                  type="number"
                  className={styles.numberInput}
                  value={editLiab.interestRate ?? ''}
                  min={0}
                  max={100}
                  step={0.01}
                  placeholder="예: 3.5"
                  onChange={(e) => updLiab('interestRate', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>남은 원금</label>
                <AmountInput
                  value={editLiab.totalBalance ?? 0}
                  onChange={(v) => updLiab('totalBalance', v > 0 ? v : undefined)}
                  placeholder="0"
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>
                  잔여 개월
                  {editLiab.repaymentType === 'bullet' && (
                    <span className={styles.requiredBadge}>만기일시상환 필수</span>
                  )}
                </label>
                <input
                  type="number"
                  className={styles.numberInput}
                  value={editLiab.remainingMonths ?? ''}
                  min={1}
                  placeholder="예: 120"
                  onChange={(e) => updLiab('remainingMonths', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>
                  월 납입금액{autoMonthly !== null && <span className={styles.autoCalcBadge}>자동계산</span>}
                </label>
                {autoMonthly !== null ? (
                  <div className={styles.autoCalcAmount}>{autoMonthly.toLocaleString('ko-KR')}원</div>
                ) : (
                  <AmountInput value={editLiab.monthlyAmount} onChange={(v) => updLiab('monthlyAmount', v)} placeholder="0" />
                )}
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>납입일</label>
                <Select
                  value={String(editLiab.dueDay)}
                  onChange={(e) => updLiab('dueDay', Number(e.target.value))}
                  options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}일` }))}
                />
              </div>
              <div className={styles.formActions}>
                <Button variant="primary" onClick={saveLiability} disabled={liabSaving}>저장</Button>
                {editLiab.id && <Button variant="danger" onClick={deleteLiability} disabled={liabSaving}>삭제</Button>}
                <Button variant="ghost" onClick={() => setLiabSheet(false)}>취소</Button>
              </div>
            </div>
          );
        })()}
      </BottomSheet>
    </div>
  );
}

interface DataTabProps {
  config: AppConfig;
  showDevTools: boolean;
}

function DataTab({ config, showDevTools }: DataTabProps) {
  const setConfig   = useAppStore((s) => s.setConfig);
  const setAccounts = useAppStore((s) => s.setAccounts);
  const setLiabilities = useAppStore((s) => s.setLiabilities);
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupWorking, setBackupWorking] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    listBackups()
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setBackupLoading(false));
  }, []);

  async function handleSaveNow() {
    setBackupWorking(true);
    setBackupMsg(null);
    try {
      await saveSnapshotNow();
      const updated = await listBackups();
      setBackups(updated);
      setBackupMsg({ text: '백업 저장 완료!', type: 'success' });
    } catch {
      setBackupMsg({ text: '백업 저장 중 오류가 발생했습니다.', type: 'error' });
    } finally {
      setBackupWorking(false);
      setTimeout(() => setBackupMsg(null), 4000);
    }
  }

  async function handleRestore(b: BackupMeta) {
    if (!confirm(`${b.date} 백업으로 복원할까요?\n\n현재 모든 데이터가 해당 시점으로 되돌아가며, 복원 후 앱이 새로고침됩니다.`)) return;
    setBackupWorking(true);
    setBackupMsg(null);
    try {
      await restoreSnapshot(b.fileId);
      setBackupMsg({ text: '복원 완료! 새로고침합니다…', type: 'success' });
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setBackupMsg({ text: '복원 중 오류가 발생했습니다.', type: 'error' });
      setBackupWorking(false);
      setTimeout(() => setBackupMsg(null), 4000);
    }
  }

  const currentYear = new Date().getFullYear();

  async function exportCsv(year: number) {
    setExporting(true);
    setExportMsg('');
    try {
      const months = Array.from({ length: 12 }, (_, i) =>
        `${year}-${String(i + 1).padStart(2, '0')}`,
      );
      const arrays = await Promise.all(months.map((ym) => localCache.getTransactions(ym)));
      const allTxs = arrays.flat().sort((a, b) => a.date.localeCompare(b.date));

      const catMap = new Map(config.categories.map((c) => [c.id, c]));
      const pmMap  = new Map(config.paymentMethods.map((p) => [p.id, p]));
      const esc    = (s: string) => `"${s.replace(/"/g, '""')}"`;

      const header = ['날짜', '유형', '카테고리', '제목', '금액', '결제수단', '메모'].join(',');
      const rows   = allTxs.map((tx) => [
        tx.date,
        tx.entryKind === 'income' ? '수입' : tx.entryKind === 'transfer' ? '이체' : '지출',
        catMap.get(tx.categoryId)?.name ?? '미분류',
        esc(tx.title),
        tx.amount,
        pmMap.get(tx.paymentMethodId ?? '')?.name ?? '',
        esc(tx.memo ?? ''),
      ].join(','));

      const csv  = [header, ...rows].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `reset-budget-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportMsg(`${year}년 거래 ${allTxs.length}건 내보내기 완료`);
    } catch {
      setExportMsg('내보내기 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(''), 4000);
    }
  }

  function exportConfigJson() {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `reset-budget-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportMsg('설정 파일 내보내기 완료');
    setTimeout(() => setExportMsg(''), 3000);
  }

  async function handleInsertSeed() {
    setSeeding(true);
    setSeedMsg('');
    try {
      await insertSeedData();
      const newConfig  = await localCache.getConfig();
      const newAccounts = await localCache.getAccounts();
      const newLiab    = await localCache.getLiabilities();
      if (newConfig)   setConfig(newConfig);
      if (newAccounts) setAccounts(newAccounts);
      if (newLiab)     setLiabilities(newLiab);
      setOnboardingCompleted(true);
      setSeedMsg('✓ 시드 데이터 삽입 완료! 새로고침하세요.');
    } catch (e) {
      setSeedMsg('오류: ' + String(e));
    } finally {
      setSeeding(false);
      setTimeout(() => setSeedMsg(''), 6000);
    }
  }

  async function handleClearSeed() {
    if (!confirm('모든 데이터를 삭제합니다. 계속하시겠습니까?')) return;
    setSeeding(true);
    setSeedMsg('');
    try {
      await clearSeedData();
      setSeedMsg('✓ 전체 데이터 삭제 완료. 새로고침하세요.');
    } catch (e) {
      setSeedMsg('오류: ' + String(e));
    } finally {
      setSeeding(false);
      setTimeout(() => setSeedMsg(''), 6000);
    }
  }

  return (
    <div className={styles.tabContent}>
      {/* 백업 및 복원 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>백업 및 복원</span>
        <p className={styles.sectionDesc}>
          매일 자동으로 스냅샷이 Google Drive에 저장됩니다. (최근 7일치 보관)
        </p>
        <button
          className={styles.exportBtn}
          onClick={handleSaveNow}
          disabled={backupWorking}
          type="button"
        >
          💾 지금 백업
        </button>
        {backupMsg && (
          <div className={`${styles.backupMsg} ${styles[backupMsg.type]}`}>
            {backupMsg.type === 'success' ? '✓ ' : '✗ '}{backupMsg.text}
          </div>
        )}
        {backupLoading ? (
          <p className={styles.backupEmpty}>백업 목록 로딩 중…</p>
        ) : backups.length === 0 ? (
          <p className={styles.backupEmpty}>저장된 백업이 없습니다.</p>
        ) : (
          <ul className={styles.backupList}>
            {backups.map((b) => (
              <li key={b.fileId} className={styles.backupItem}>
                <div>
                  <div className={styles.backupDate}>{b.date}</div>
                  <div className={styles.backupTime}>
                    {new Date(b.savedAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장
                  </div>
                </div>
                <button
                  className={styles.backupRestoreBtn}
                  onClick={() => handleRestore(b)}
                  disabled={backupWorking}
                  type="button"
                >
                  복원
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* CSV 내보내기 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>거래 내역 내보내기 (CSV)</span>
        <div className={styles.exportBtnRow}>
          <button
            className={styles.exportBtn}
            onClick={() => exportCsv(currentYear)}
            disabled={exporting}
            type="button"
          >
            📥 {currentYear}년 내보내기
          </button>
          <button
            className={styles.exportBtn}
            onClick={() => exportCsv(currentYear - 1)}
            disabled={exporting}
            type="button"
          >
            📥 {currentYear - 1}년 내보내기
          </button>
        </div>
      </div>

      {/* JSON 내보내기 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>설정 내보내기 (JSON)</span>
        <button
          className={styles.exportBtn}
          onClick={exportConfigJson}
          disabled={exporting}
          type="button"
        >
          📤 설정 파일 내보내기
        </button>
      </div>

      {exportMsg && (
        <div className={styles.exportMsg}>
          ✓ {exportMsg}
        </div>
      )}

      {/* 개발자 도구 (중요: 시드 데이터/데이터 초기화 복구) */}
      {showDevTools && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>🧪 개발자 도구</span>
          <p className={styles.sectionDesc}>
            UI 확인을 위한 샘플 데이터를 삽입하거나 전체 데이터를 초기화합니다.
          </p>
          <div className={styles.exportBtnRow}>
            <button
              className={styles.exportBtn}
              onClick={handleInsertSeed}
              disabled={seeding}
              type="button"
              style={{ borderColor: 'var(--accent-1)', color: 'var(--accent-1)' }}
            >
              {seeding ? '⏳ 삽입 중…' : '🌱 시드 데이터 삽입'}
            </button>
            <button
              className={styles.exportBtn}
              onClick={handleClearSeed}
              disabled={seeding}
              type="button"
              style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
            >
              🗑️ 전체 데이터 초기화
            </button>
          </div>
          {seedMsg && (
            <div className={styles.exportMsg} style={seedMsg.startsWith('오류') ? { background: 'rgba(244, 114, 114, 0.12)', borderColor: 'var(--error)', color: 'var(--error)' } : undefined}>
              {seedMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SettingsPageMobile() {
  const navigate       = useNavigate();
  const config         = useAppStore((s) => s.config);
  const setConfig      = useAppStore((s) => s.setConfig);
  const setTheme       = useAppStore((s) => s.setTheme);
  const logout         = useAppStore((s) => s.logout);
  const lastSyncedAt   = useAppStore((s) => s.lastSyncedAt);
  const accounts       = useAppStore((s) => s.accounts);
  const setAccounts    = useAppStore((s) => s.setAccounts);
  const liabilities    = useAppStore((s) => s.liabilities);
  const setLiabilities = useAppStore((s) => s.setLiabilities);
  const userTier       = useAppStore((s) => s.userTier);
  const activatedCode  = useAppStore((s) => s.activatedCode);
  const unlockWithCode = useAppStore((s) => s.unlockWithCode);

  const [activeTab, setActiveTab]           = useState<Tab>('general');
  const [thresholdInput, setThresholdInput] = useState(String(config.resetThresholdDays));
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState('');

  const [savingsTargetInput, setSavingsTargetInput] = useState(config.savingsTargetDefault);
  const [monthModeInput, setMonthModeInput] = useState(config.monthMode);
  const [paydayInput, setPaydayInput] = useState(config.payday);
  const [budgetSaveMsg, setBudgetSaveMsg] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);

  useEffect(() => {
    setThresholdInput(String(config.resetThresholdDays));
    setSavingsTargetInput(config.savingsTargetDefault);
    setMonthModeInput(config.monthMode);
    setPaydayInput(config.payday);
  }, [
    config.resetThresholdDays,
    config.savingsTargetDefault,
    config.monthMode,
    config.payday
  ]);

  const [codeInput, setCodeInput]   = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const [showDevTools, setShowDevTools] = useState(false);
  const [, setVersionClickCount] = useState(0);

  const handleVersionClick = () => {
    if (showDevTools) return;
    setVersionClickCount((prev) => {
      const next = prev + 1;
      if (next >= 7) {
        setShowDevTools(true);
        alert('🧪 개발자 도구가 활성화되었습니다. [데이터] 탭에서 확인할 수 있습니다.');
        return 0;
      }
      return next;
    });
  };

  const handleCodeActivate = async () => {
    if (!codeInput.trim()) return;
    setCodeStatus('loading');
    const result = await unlockWithCode(codeInput);
    setCodeStatus(result ? 'success' : 'error');
    if (result) setCodeInput('');
  };

  const canAccessFull = true;

  async function applyConfig(newConfig: AppConfig) {
    setConfig(newConfig);
    await localCache.setConfig(newConfig);
    await driveAdapter.writeConfig(makeEnvelope('config.json', newConfig));
  }

  const handleTheme = async (mode: ThemeMode) => {
    setTheme(mode);
    await applyConfig({ ...config, themeMode: mode });
  };

  const handleThresholdSave = async () => {
    const val = parseInt(thresholdInput, 10);
    if (isNaN(val) || val < 1 || val > 30) {
      setSaveMsg('1~30 사이의 숫자를 입력해주세요.');
      return;
    }
    setSaving(true); setSaveMsg('');
    try {
      await applyConfig({ ...config, resetThresholdDays: val });
      setSaveMsg('저장되었습니다.');
      setTimeout(() => setSaveMsg(''), 2000);
    } finally { setSaving(false); }
  };

  const handleBudgetSave = async () => {
    if (savingsTargetInput < 0) {
      setBudgetSaveMsg('올바른 금액을 입력해주세요.');
      return;
    }
    setBudgetSaving(true);
    setBudgetSaveMsg('');
    try {
      await applyConfig({
        ...config,
        savingsTargetDefault: savingsTargetInput,
        monthMode: monthModeInput,
        payday: paydayInput,
      });
      setBudgetSaveMsg('저장되었습니다.');
      setTimeout(() => setBudgetSaveMsg(''), 2000);
    } catch (err) {
      setBudgetSaveMsg('저장에 실패했습니다.');
    } finally {
      setBudgetSaving(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('로그아웃하시겠어요? 로컬 데이터는 유지됩니다.')) return;
    await logout();
  };

  async function handleAccountsChange(list: Account[]) {
    setAccounts(list);
    await localCache.setAccounts(list);
    await driveAdapter.writeAccounts(makeEnvelope('accounts.json', list));
  }
  async function handleLiabilitiesChange(list: Liability[]) {
    setLiabilities(list);
    await localCache.setLiabilities(list);
    await driveAdapter.writeLiabilities(makeEnvelope('liabilities.json', list));
  }

  const themeOptions: { value: ThemeMode; label: string; desc: string }[] = [
    { value: 'noir_black',  label: '🌙 다크',   desc: '누아르 어두운 테마' },
    { value: 'ivory_light', label: '☀️ 라이트', desc: '아이보리 밝은 테마' },
  ];

  const syncTimeStr = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

  return (
    <div className={styles.page}>
      {/* 헤더 */}
      <header className={styles.header}>
        <span className={styles.pageTitle}>설정</span>
      </header>

      {/* 가로 스크롤 가능한 둥근 탭 버튼 */}
      <section className={styles.tabsWrapper}>
        <div className={styles.tabsScroll}>
          {TABS.map((t) => {
            const tabLocked = t.key !== 'general' && !canAccessFull;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
                onClick={() => tabLocked ? navigate(ROUTES.upgrade) : setActiveTab(t.key)}
                type="button"
              >
                <span className={styles.tabIcon}>{tabLocked ? '🔒' : t.icon}</span>
                <span className={styles.tabLabel}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 탭 본문 */}
      <main className={styles.mainContent}>
        {activeTab === 'general' && (
          <div className={styles.tabContent}>
            {/* 플랜 정보 */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>현재 플랜</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: tierColor(userTier) }}>
                  {tierLabel(userTier)}
                </span>
              </div>
              {userTier === 'free' ? (
                <>
                  <p className={styles.sectionDesc}>
                    후원 코드를 입력해 기능을 활성화하세요.
                  </p>
                  <div className={styles.thresholdRow}>
                    <input
                      className={styles.thresholdInput}
                      type="text"
                      value={codeInput}
                      onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setCodeStatus('idle'); }}
                      placeholder="후원 코드 (예: BASIC-XXXX)"
                      maxLength={20}
                      autoComplete="off"
                    />
                    <button
                      className={styles.saveBtn}
                      onClick={handleCodeActivate}
                      disabled={codeStatus === 'loading' || !codeInput.trim()}
                      type="button"
                    >
                      활성화
                    </button>
                  </div>
                  {codeStatus === 'success' && <p className={styles.saveMsg}>✓ 활성화 완료!</p>}
                  {codeStatus === 'error' && <p className={styles.saveMsg} style={{ color: 'var(--error)' }}>잘못된 코드입니다.</p>}
                </>
              ) : (
                <div className={styles.syncCard} style={{ marginTop: 8 }}>
                  <div className={styles.syncRow}>
                    <span>인증된 코드</span>
                    <span className={styles.syncValue} style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {activatedCode || '정식 활성화 완료'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 테마 */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>테마</span>
              <div className={styles.themeRow}>
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    className={`${styles.themeBtn} ${config.themeMode === opt.value ? styles.themeBtnActive : ''}`}
                    onClick={() => handleTheme(opt.value)}
                    type="button"
                  >
                    <span className={styles.themeBtnLabel}>{opt.label}</span>
                    <span className={styles.themeBtnDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 저축 목표 및 예산 기준일 */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>저축 목표 및 예산 기준일</span>
              <p className={styles.sectionDesc}>저축 목표액과 수입 기준일을 설정합니다.</p>
              <div className={styles.form} style={{ gap: 'var(--space-sm)' }}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>기본 저축 목표액</label>
                  <AmountInput
                    value={savingsTargetInput}
                    onChange={(v) => setSavingsTargetInput(v)}
                    placeholder="0"
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>월 기준 (수입 입금일 기준)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '4px 0' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                      <input
                        type="radio"
                        name="monthMode"
                        value="calendar"
                        checked={monthModeInput === 'calendar'}
                        onChange={() => setMonthModeInput('calendar')}
                        style={{ accentColor: 'var(--accent-1)' }}
                      />
                      <span>달력 월 (매달 1일 ~ 말일 기준)</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                      <input
                        type="radio"
                        name="monthMode"
                        value="payday"
                        checked={monthModeInput === 'payday'}
                        onChange={() => setMonthModeInput('payday')}
                        style={{ accentColor: 'var(--accent-1)' }}
                      />
                      <span>급여일 기준 (입금일 다음 날부터)</span>
                    </label>
                  </div>
                </div>
                {monthModeInput === 'payday' && (
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>매달 입금일 (급여일)</label>
                    <Select
                      value={String(paydayInput)}
                      options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}일` }))}
                      onChange={(e) => setPaydayInput(Number(e.target.value))}
                    />
                  </div>
                )}
                <button
                  className={styles.saveBtn}
                  onClick={handleBudgetSave}
                  disabled={budgetSaving}
                  type="button"
                  style={{ alignSelf: 'flex-start' }}
                >
                  저장
                </button>
              </div>
              {budgetSaveMsg && <p className={styles.saveMsg}>{budgetSaveMsg}</p>}
            </div>

            {/* 임계값 */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>기록 공백 임계값</span>
              <p className={styles.sectionDesc}>이 일수 이상 기록이 없으면 복귀 배너가 표시됩니다.</p>
              <div className={styles.thresholdRow}>
                <input
                  className={styles.thresholdInput}
                  type="number" min={1} max={30}
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                />
                <span className={styles.thresholdUnit}>일</span>
                <button className={styles.saveBtn} onClick={handleThresholdSave} disabled={saving} type="button">
                  저장
                </button>
              </div>
              {saveMsg && <p className={styles.saveMsg}>{saveMsg}</p>}
            </div>

            {/* 동기화 */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>동기화 정보</span>
              <div className={styles.syncCard}>
                <div className={styles.syncRow}>
                  <span>마지막 동기화</span>
                  <span className={styles.syncValue}>{syncTimeStr}</span>
                </div>
                <div className={styles.syncRow}>
                  <span>저장 공간</span>
                  <span className={styles.syncValue}>Google Drive (Cloud)</span>
                </div>
              </div>
            </div>

            {/* 앱 정보 */}
            <div className={styles.section}>
              <span className={styles.sectionTitle}>앱 정보</span>
              <div className={styles.syncCard}>
                <div
                  className={styles.syncRow}
                  onClick={handleVersionClick}
                  style={{ cursor: 'pointer' }}
                  role="button"
                >
                  <span>버전</span>
                  <span className={styles.syncValue}>머니셋 V2.0</span>
                </div>
                <div className={styles.syncRow}>
                  <span>카테고리</span>
                  <span className={styles.syncValue}>{config.categories.length}개</span>
                </div>
                <div className={styles.syncRow}>
                  <span>결제수단</span>
                  <span className={styles.syncValue}>{config.paymentMethods.length}개</span>
                </div>
                <div className={styles.syncRow}>
                  <span>고정지출 규칙</span>
                  <span className={styles.syncValue}>{config.fixedExpenses.length}개</span>
                </div>
              </div>
            </div>

            {/* 로그아웃 */}
            <div className={styles.logoutWrapper}>
              <button className={styles.logoutBtn} onClick={handleLogout} type="button">
                로그아웃
              </button>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <CategoryTab config={config} onConfigChange={applyConfig} />
        )}

        {activeTab === 'assets' && (
          <AssetsTab
            accounts={accounts}
            liabilities={liabilities}
            onAccountsChange={handleAccountsChange}
            onLiabilitiesChange={handleLiabilitiesChange}
          />
        )}

        {activeTab === 'data' && (
          <DataTab config={config} showDevTools={showDevTools} />
        )}
      </main>
    </div>
  );
}
