// RecurringPage — RESET Budget V2 (PC Dashboard Layout)

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../app/store/appStore';
import {
  getRecurringItems,
  upsertRecurringItem,
  deleteRecurringItem,
  hasPendingSync,
} from '../../storage/localPlanStore';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import type { RecurringItem, RecurringKind, RecurringCycle, Category, Account } from '../../domain/types';
import { toLocalDateStr } from '../../domain/safetyUtils';
import styles from './RecurringPage.module.css';

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

const KIND_LABELS: Record<RecurringKind, string> = {
  regular:      '정기지출',
  subscription: '구독',
  installment:  '할부',
  transfer:     '자산이동',
};

const KIND_ICONS: Record<RecurringKind, string> = {
  regular:      '🔄',
  subscription: '📦',
  installment:  '💳',
  transfer:     '💰',
};

const CYCLE_LABELS: Record<RecurringCycle, string> = {
  monthly: '매월',
  weekly:  '매주',
  yearly:  '매년',
};

const TAB_KINDS: RecurringKind[] = ['regular', 'subscription', 'installment', 'transfer'];

function emptyItem(kind: RecurringKind): RecurringItem {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  return {
    id: '',
    kind,
    title: kind === 'transfer' ? '저축 이체' : '',
    amount: 0,
    categoryId: '',
    nextDueDate: today,
    enabled: true,
    accountId: '',
    cycle: 'monthly',
    dayOfMonth: new Date().getDate(),
    providerName: '',
    billingCycle: 'monthly',
    firstBillingDate: today,
    totalInstallments: 12,
    remainingInstallments: 12,
    startedAt: today,
    fromAccountId: '',
    toAccountId: '',
    transferCycle: 'monthly',
    createdAt: now,
    updatedAt: now,
  };
}

// ─── RecurringItemCard ────────────────────────────────────────────────────────

interface ItemCardProps {
  item: RecurringItem;
  categoryMap: Map<string, Category>;
  accountMap: Map<string, Account>;
  onEdit: (item: RecurringItem) => void;
  onDelete: (id: string) => void;
  onToggle: (item: RecurringItem) => void;
  onExecuteTransfer?: (id: string) => void;
}

function RecurringItemCard({ item, categoryMap, accountMap, onEdit, onDelete, onToggle, onExecuteTransfer }: ItemCardProps) {
  const cat = categoryMap.get(item.categoryId);
  const account = accountMap.get(item.accountId ?? '');
  const fromAccount = accountMap.get(item.fromAccountId ?? '');
  const toAccount   = accountMap.get(item.toAccountId ?? '');
  const daysUntil = (() => {
    const today = toLocalDateStr(new Date());
    if (item.nextDueDate < today) return -1;
    // 'T00:00:00'을 붙여 로컬 시간 기준으로 파싱 (UTC 파싱 방지 → 시간대 오차 1일 방지)
    const diff = new Date(item.nextDueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  })();

  return (
    <div className={`${styles.card} ${!item.enabled ? styles.cardDisabled : styles.cardEnabled}`}>
      <div className={styles.cardTop}>
        <span className={styles.cardIcon}>{cat?.icon ?? KIND_ICONS[item.kind]}</span>
        <div className={styles.cardInfo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={styles.cardTitle}>{item.title || '(제목 없음)'}</span>
            {account?.isBudgetAccount && (
              <span style={{
                fontSize: 9,
                background: 'rgba(63,214,164,0.15)',
                color: 'var(--mint-300)',
                padding: '1px 5px',
                borderRadius: 4,
                fontWeight: 700,
                lineHeight: 1,
                whiteSpace: 'nowrap'
              }}>
                생활비
              </span>
            )}
          </div>
          <span className={styles.cardMeta}>
            {item.kind === 'transfer' ? (
              <>
                {fromAccount ? fromAccount.name : '계좌 미지정'}
                {' → '}
                {toAccount ? toAccount.name : '계좌 미지정'}
                {item.transferCycle && ` · ${CYCLE_LABELS[item.transferCycle]}`}
              </>
            ) : (
              <>
                {cat?.name ?? '미분류'}
                {item.kind === 'regular' && item.cycle && ` · ${CYCLE_LABELS[item.cycle]}`}
                {item.kind === 'subscription' && item.billingCycle && ` · ${CYCLE_LABELS[item.billingCycle]}`}
                {item.kind === 'installment' && item.remainingInstallments !== undefined && ` · 잔여 ${item.remainingInstallments}회`}
                {account && ` · ${account.name}`}
              </>
            )}
          </span>
        </div>
        <div className={styles.cardRight}>
          <span className={styles.cardAmount}>{fmt(item.amount)}</span>
          {daysUntil >= 0 && daysUntil <= 7 && (
            <span className={`${styles.dueBadge} ${daysUntil <= 3 ? styles.dueBadgeUrgent : ''}`}>
              {daysUntil === 0 ? '오늘' : `D-${daysUntil}`}
            </span>
          )}
        </div>
      </div>

      <div className={styles.cardBottom}>
        <span className={styles.cardDue}>
          {item.kind === 'transfer' ? '다음 이체일' : '다음 납부'} {item.nextDueDate}
        </span>
        <div className={styles.cardActions}>
          {item.kind === 'transfer' && item.enabled && onExecuteTransfer && (
            <button
              className={styles.executeBtn}
              onClick={() => onExecuteTransfer(item.id)}
              title="이체 실행 (잔액 반영)"
            >
              이체
            </button>
          )}
          <button
            className={`${styles.toggleBtn} ${item.enabled ? styles.toggleOn : styles.toggleOff}`}
            onClick={() => onToggle(item)}
            aria-label={item.enabled ? '비활성화' : '활성화'}
          >
            {item.enabled ? 'ON' : 'OFF'}
          </button>
          <button className={styles.editBtn} onClick={() => onEdit(item)} aria-label="수정">✏</button>
          <button className={styles.deleteBtn} onClick={() => onDelete(item.id)} aria-label="삭제">✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── RecurringPage ────────────────────────────────────────────────────────────

export function RecurringPage() {
  const config          = useAppStore((s) => s.config);
  const accounts        = useAppStore((s) => s.accounts);
  const executeTransfer = useAppStore((s) => s.executeTransfer);

  const [activeTab, setActiveTab] = useState<RecurringKind>('regular');
  const [items, setItems]         = useState<RecurringItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing]     = useState<RecurringItem>(emptyItem('regular'));
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsPending(hasPendingSync());
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const loadItems = useCallback(async () => {
    const loaded = await getRecurringItems();
    setItems(loaded);
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const categoryMap = new Map(config.categories.map((c) => [c.id, c]));
  const accountMap  = new Map(accounts.map((a) => [a.id, a]));
  const requiredCategories = config.categories.filter(
    (c) => c.entryKind === 'expense' && (c.budgetGroup === 'required' || c.budgetGroup === 'living'),
  );

  function openAdd() { setEditing(emptyItem(activeTab)); setSheetOpen(true); }
  function openEdit(item: RecurringItem) { setEditing({ ...item }); setSheetOpen(true); }

  async function handleDelete(id: string) {
    await deleteRecurringItem(id);
    const loaded = await getRecurringItems();
    setItems(loaded);
  }

  async function handleToggle(item: RecurringItem) {
    const updated: RecurringItem = { ...item, enabled: !item.enabled, updatedAt: new Date().toISOString() };
    await upsertRecurringItem(updated);
    const loaded = await getRecurringItems();
    setItems(loaded);
  }

  async function handleSave() {
    if (!editing.title.trim() || editing.amount <= 0) return;
    if (editing.kind === 'transfer' && (!editing.fromAccountId || !editing.toAccountId)) return;
    const now = new Date().toISOString();
    const toSave: RecurringItem = {
      ...editing,
      id: editing.id || `ri_${crypto.randomUUID()}`,
      updatedAt: now,
      createdAt: editing.id ? editing.createdAt : now,
    };
    await upsertRecurringItem(toSave);
    const loaded = await getRecurringItems();
    setItems(loaded);
    setSheetOpen(false);
  }

  function update<K extends keyof RecurringItem>(key: K, value: RecurringItem[K]) {
    setEditing((prev) => ({ ...prev, [key]: value }));
  }

  const tabItems = items.filter((i) => i.kind === activeTab);
  // yearly 주기는 월 환산 집계에서 제외 (홈화면 totalMonthly와 동일 기준)
  const tabTotal = tabItems
    .filter((i) => i.enabled)
    .filter((i) => {
      if (i.kind === 'subscription') return i.billingCycle !== 'yearly';
      if (i.kind === 'transfer')     return i.transferCycle !== 'yearly';
      return i.cycle !== 'yearly';
    })
    .reduce((s, i) => s + i.amount, 0);

  // 예정 납부 일정 (다음 30일)
  const today = new Date();
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(today.getDate() + 30);
  const todayStr = toLocalDateStr(today);
  const laterStr = toLocalDateStr(thirtyDaysLater);
  const upcoming = items
    .filter((i) => i.enabled && i.nextDueDate >= todayStr && i.nextDueDate <= laterStr)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  // 전체 합계 (yearly 주기 항목은 월 환산에서 제외)
  const totalMonthly = items
    .filter((i) => i.enabled)
    .filter((i) => {
      if (i.kind === 'subscription') return i.billingCycle !== 'yearly';
      if (i.kind === 'transfer')     return i.transferCycle !== 'yearly';
      return i.cycle !== 'yearly';
    })
    .reduce((s, i) => s + i.amount, 0);

  return (
    <div className={styles.page}>
      {/* ── 상단 바 ── */}
      <div className={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 className={styles.pageTitle}>정기지출 · 구독 · 할부</h1>
          {isPending && (
            <span style={{ fontSize: 12, color: 'var(--gold-400)', display: 'flex', alignItems: 'center', gap: 4, animation: 'pulse 1.5s infinite' }}>
              ☁️ 클라우드 동기화 중...
            </span>
          )}
        </div>
        <div className={styles.topStats}>
          <div className={styles.topStat}>
            <span className={styles.topStatLabel}>월 합계</span>
            <span className={styles.topStatVal} style={{ color: 'var(--expense)' }}>{fmt(totalMonthly)}</span>
          </div>
          <div className={styles.topStat}>
            <span className={styles.topStatLabel}>활성 항목</span>
            <span className={styles.topStatVal}>{items.filter(i=>i.enabled).length}건</span>
          </div>
          <div className={styles.topStat}>
            <span className={styles.topStatLabel}>30일 예정</span>
            <span className={styles.topStatVal}>{upcoming.length}건</span>
          </div>
        </div>
      </div>

      {/* ── 메인 그리드 ── */}
      <div className={styles.mainGrid}>

        {/* ── 왼쪽: 탭 + 목록 ── */}
        <div className={styles.leftCol}>
          {/* 탭 */}
          <div className={styles.tabs} role="tablist">
            {TAB_KINDS.map((k) => {
              const kindItems = items.filter((i) => i.kind === k && i.enabled);
              const kindTotal = kindItems.reduce((s, i) => s + i.amount, 0);
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={activeTab === k}
                  className={`${styles.tab} ${activeTab === k ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(k)}
                >
                  <span className={styles.tabIcon}>{KIND_ICONS[k]}</span>
                  <span className={styles.tabLabel}>{KIND_LABELS[k]}</span>
                  <span className={styles.tabCount}>{kindItems.length}건</span>
                  {kindTotal > 0 && (
                    <span className={styles.tabAmount}>{fmt(kindTotal)}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 탭 콘텐츠 */}
          <div className={styles.tabContent}>
            <div className={styles.tabHeader}>
              <span className={styles.tabSummary}>
                활성 {tabItems.filter((i) => i.enabled).length}건 · 월 {fmt(tabTotal)}
              </span>
              <Button variant="primary" onClick={openAdd}>+ 추가</Button>
            </div>

            {tabItems.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>등록된 {KIND_LABELS[activeTab]}이 없습니다.</p>
                <p className={styles.emptyHint}>+ 추가 버튼으로 등록해보세요.</p>
              </div>
            ) : (
              <div className={styles.cardGrid}>
                {tabItems.map((item) => (
                  <RecurringItemCard
                    key={item.id}
                    item={item}
                    categoryMap={categoryMap}
                    accountMap={accountMap}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                    onExecuteTransfer={executeTransfer}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 오른쪽: 예정 납부 ── */}
        <div className={styles.rightCol}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>향후 30일 납부 예정</h2>
            {upcoming.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyHint}>납부 예정 항목이 없습니다.</p>
              </div>
            ) : (
              <div className={styles.upcomingList}>
                {upcoming.map((item) => {
                  const cat = categoryMap.get(item.categoryId);
                  const fromAcc = accountMap.get(item.fromAccountId ?? '');
                  const toAcc   = accountMap.get(item.toAccountId ?? '');
                  const daysUntil = Math.ceil((new Date(item.nextDueDate + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={item.id} className={styles.upcomingItem}>
                      <div className={`${styles.upcomingDateBox} ${daysUntil <= 3 ? styles.upcomingDateBoxUrgent : ''}`}>
                        <span className={styles.upcomingDateMo}>{item.nextDueDate.slice(5, 7)}월</span>
                        <span className={styles.upcomingDateDay}>{item.nextDueDate.slice(8)}</span>
                        {daysUntil === 0 && <span className={styles.upcomingToday}>TODAY</span>}
                        {daysUntil > 0 && <span className={styles.upcomingDday}>D-{daysUntil}</span>}
                      </div>
                      <span className={styles.upcomingIcon}>{cat?.icon ?? KIND_ICONS[item.kind]}</span>
                      <div className={styles.upcomingInfo}>
                        <span className={styles.upcomingTitle}>{item.title}</span>
                        <span className={styles.upcomingMeta}>
                          {item.kind === 'transfer'
                            ? `${fromAcc?.name ?? '?'} → ${toAcc?.name ?? '?'} · 자산이동`
                            : `${cat?.name ?? '미분류'} · ${KIND_LABELS[item.kind]}`}
                        </span>
                      </div>
                      <span className={styles.upcomingAmount}>{fmt(item.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 월별 비용 분포 */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>종류별 비용</h2>
            <div className={styles.kindSummaryList}>
              {TAB_KINDS.map((k) => {
                const kindItems = items.filter((i) => i.kind === k && i.enabled);
                const kindTotal = kindItems.reduce((s, i) => s + i.amount, 0);
                const pct = totalMonthly > 0 ? (kindTotal / totalMonthly) * 100 : 0;
                return (
                  <div key={k} className={styles.kindSummaryItem}>
                    <div className={styles.kindSummaryHeader}>
                      <span className={styles.kindSummaryIcon}>{KIND_ICONS[k]}</span>
                      <span className={styles.kindSummaryLabel}>{KIND_LABELS[k]}</span>
                      <span className={styles.kindSummaryCount}>{kindItems.length}건</span>
                      <span className={styles.kindSummaryAmount}>{fmt(kindTotal)}</span>
                    </div>
                    <div className={styles.kindBarTrack}>
                      <div className={styles.kindBarFill} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 입력/수정 BottomSheet */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`${KIND_LABELS[editing.kind]} ${editing.id ? '수정' : '추가'}`}
      >
        <div className={styles.form}>
          <Input
            label="제목"
            value={editing.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder={editing.kind === 'transfer' ? '예: 저축 이체' : '예: 넷플릭스'}
            required
          />

          {/* transfer 전용 폼 */}
          {editing.kind === 'transfer' ? (
            <>
              <div className={styles.formField}>
                <label className={styles.formLabel}>이체 금액</label>
                <AmountInput value={editing.amount} onChange={(v) => update('amount', v)} placeholder="0" />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>출금 계좌 (이체 출발)</label>
                <Select
                  value={editing.fromAccountId ?? ''}
                  onChange={(e) => update('fromAccountId', e.target.value)}
                  options={[
                    { value: '', label: '계좌 선택' },
                    ...accounts.filter((a) => a.isActive).map((a) => ({
                      value: a.id,
                      label: `${a.institution ? a.institution + ' ' : ''}${a.name}${a.isBudgetAccount ? ' (생활비)' : ''}`,
                    })),
                  ]}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>입금 계좌 (이체 도착)</label>
                <Select
                  value={editing.toAccountId ?? ''}
                  onChange={(e) => update('toAccountId', e.target.value)}
                  options={[
                    { value: '', label: '계좌 선택' },
                    ...accounts.filter((a) => a.isActive && a.id !== editing.fromAccountId).map((a) => ({
                      value: a.id,
                      label: `${a.institution ? a.institution + ' ' : ''}${a.name}`,
                    })),
                  ]}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>이체 주기</label>
                <Select
                  value={editing.transferCycle ?? 'monthly'}
                  onChange={(e) => update('transferCycle', e.target.value as RecurringCycle)}
                  options={[
                    { value: 'monthly', label: '매월' },
                    { value: 'weekly',  label: '매주' },
                    { value: 'yearly',  label: '매년' },
                  ]}
                />
              </div>

              <Input
                label="다음 이체일"
                value={editing.nextDueDate}
                onChange={(e) => update('nextDueDate', e.target.value)}
                type="date"
              />
            </>
          ) : (
            <>
              <div className={styles.formField}>
                <label className={styles.formLabel}>카테고리</label>
                <Select
                  value={editing.categoryId}
                  onChange={(e) => update('categoryId', e.target.value)}
                  options={[
                    { value: '', label: '카테고리 선택' },
                    ...requiredCategories.map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.name}` })),
                  ]}
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>금액</label>
                <AmountInput value={editing.amount} onChange={(v) => update('amount', v)} placeholder="0" />
              </div>

              <Input
                label="다음 납부일"
                value={editing.nextDueDate}
                onChange={(e) => update('nextDueDate', e.target.value)}
                type="date"
              />

              <div className={styles.formField}>
                <label className={styles.formLabel}>연결 출금 계좌 (선택)</label>
                <Select
                  value={editing.accountId ?? ''}
                  onChange={(e) => update('accountId', e.target.value)}
                  options={[
                    { value: '', label: '계좌 선택 안함' },
                    ...accounts
                      .filter((a) => a.isActive)
                      .map((a) => ({
                        value: a.id,
                        label: `${a.institution ? a.institution + ' ' : ''}${a.name}${a.isBudgetAccount ? ' (생활비)' : ''}`,
                      })),
                  ]}
                />
              </div>
            </>
          )}

          {editing.kind === 'regular' && (
            <div className={styles.formField}>
              <label className={styles.formLabel}>주기</label>
              <Select
                value={editing.cycle ?? 'monthly'}
                onChange={(e) => update('cycle', e.target.value as RecurringCycle)}
                options={[
                  { value: 'monthly', label: '매월' },
                  { value: 'weekly',  label: '매주' },
                  { value: 'yearly',  label: '매년' },
                ]}
              />
            </div>
          )}

          {editing.kind === 'subscription' && (
            <>
              <Input
                label="서비스명"
                value={editing.providerName ?? ''}
                onChange={(e) => update('providerName', e.target.value)}
                placeholder="예: Netflix"
              />
              <div className={styles.formField}>
                <label className={styles.formLabel}>결제 주기</label>
                <Select
                  value={editing.billingCycle ?? 'monthly'}
                  onChange={(e) => update('billingCycle', e.target.value as RecurringCycle)}
                  options={[
                    { value: 'monthly', label: '매월' },
                    { value: 'yearly',  label: '매년' },
                  ]}
                />
              </div>
            </>
          )}

          {editing.kind === 'installment' && (
            <>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>총 회차</label>
                  <input
                    type="number"
                    className={styles.numberInput}
                    value={editing.totalInstallments ?? ''}
                    min={1}
                    onChange={(e) => update('totalInstallments', Number(e.target.value))}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>잔여 회차</label>
                  <input
                    type="number"
                    className={styles.numberInput}
                    value={editing.remainingInstallments ?? ''}
                    min={0}
                    onChange={(e) => update('remainingInstallments', Number(e.target.value))}
                  />
                </div>
              </div>
              <Input
                label="시작일"
                value={editing.startedAt ?? ''}
                onChange={(e) => update('startedAt', e.target.value)}
                type="date"
              />
            </>
          )}

          <div className={styles.formActions}>
            <Button variant="primary" onClick={handleSave}>저장</Button>
            {editing.id && (
              <Button
                variant="danger"
                onClick={() => { handleDelete(editing.id); setSheetOpen(false); }}
              >
                삭제
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSheetOpen(false)}>취소</Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
