// RecurringPage — RESET Budget V2 (PC Dashboard Layout)

import { useState, useEffect } from 'react';
import { useAppStore } from '../../app/store/appStore';
import {
  getRecurringItems,
  upsertRecurringItem,
  deleteRecurringItem,
} from '../../storage/localPlanStore';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';
import type { RecurringItem, RecurringKind, RecurringCycle, Category } from '../../domain/types';
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
};

const KIND_ICONS: Record<RecurringKind, string> = {
  regular:      '🔄',
  subscription: '📦',
  installment:  '💳',
};

const CYCLE_LABELS: Record<RecurringCycle, string> = {
  monthly: '매월',
  weekly:  '매주',
  yearly:  '매년',
};

const TAB_KINDS: RecurringKind[] = ['regular', 'subscription', 'installment'];

function emptyItem(kind: RecurringKind): RecurringItem {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  return {
    id: '',
    kind,
    title: '',
    amount: 0,
    categoryId: '',
    nextDueDate: today,
    enabled: true,
    cycle: 'monthly',
    dayOfMonth: new Date().getDate(),
    providerName: '',
    billingCycle: 'monthly',
    firstBillingDate: today,
    totalInstallments: 12,
    remainingInstallments: 12,
    startedAt: today,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── RecurringItemCard ────────────────────────────────────────────────────────

interface ItemCardProps {
  item: RecurringItem;
  categoryMap: Map<string, Category>;
  onEdit: (item: RecurringItem) => void;
  onDelete: (id: string) => void;
  onToggle: (item: RecurringItem) => void;
}

function RecurringItemCard({ item, categoryMap, onEdit, onDelete, onToggle }: ItemCardProps) {
  const cat = categoryMap.get(item.categoryId);
  const daysUntil = (() => {
    const today = toLocalDateStr(new Date());
    if (item.nextDueDate < today) return -1;
    const diff = new Date(item.nextDueDate).getTime() - new Date(today).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  })();

  return (
    <div className={`${styles.card} ${!item.enabled ? styles.cardDisabled : styles.cardEnabled}`}>
      <div className={styles.cardTop}>
        <span className={styles.cardIcon}>{cat?.icon ?? KIND_ICONS[item.kind]}</span>
        <div className={styles.cardInfo}>
          <span className={styles.cardTitle}>{item.title || '(제목 없음)'}</span>
          <span className={styles.cardMeta}>
            {cat?.name ?? '미분류'}
            {item.kind === 'regular' && item.cycle && ` · ${CYCLE_LABELS[item.cycle]}`}
            {item.kind === 'subscription' && item.billingCycle && ` · ${CYCLE_LABELS[item.billingCycle]}`}
            {item.kind === 'installment' && item.remainingInstallments !== undefined && ` · 잔여 ${item.remainingInstallments}회`}
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
        <span className={styles.cardDue}>다음 납부 {item.nextDueDate}</span>
        <div className={styles.cardActions}>
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
  const config = useAppStore((s) => s.config);

  const [activeTab, setActiveTab] = useState<RecurringKind>('regular');
  const [items, setItems]         = useState<RecurringItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing]     = useState<RecurringItem>(emptyItem('regular'));

  useEffect(() => {
    setItems(getRecurringItems());
  }, []);

  const categoryMap = new Map(config.categories.map((c) => [c.id, c]));
  const requiredCategories = config.categories.filter(
    (c) => c.entryKind === 'expense' && (c.budgetGroup === 'required' || c.budgetGroup === 'living'),
  );

  function openAdd() { setEditing(emptyItem(activeTab)); setSheetOpen(true); }
  function openEdit(item: RecurringItem) { setEditing({ ...item }); setSheetOpen(true); }

  function handleDelete(id: string) {
    deleteRecurringItem(id);
    setItems(getRecurringItems());
  }

  function handleToggle(item: RecurringItem) {
    const updated: RecurringItem = { ...item, enabled: !item.enabled, updatedAt: new Date().toISOString() };
    upsertRecurringItem(updated);
    setItems(getRecurringItems());
  }

  function handleSave() {
    if (!editing.title.trim() || editing.amount <= 0) return;
    const now = new Date().toISOString();
    const toSave: RecurringItem = {
      ...editing,
      id: editing.id || `ri_${crypto.randomUUID()}`,
      updatedAt: now,
      createdAt: editing.id ? editing.createdAt : now,
    };
    upsertRecurringItem(toSave);
    setItems(getRecurringItems());
    setSheetOpen(false);
  }

  function update<K extends keyof RecurringItem>(key: K, value: RecurringItem[K]) {
    setEditing((prev) => ({ ...prev, [key]: value }));
  }

  const tabItems = items.filter((i) => i.kind === activeTab);
  const tabTotal = tabItems.filter((i) => i.enabled).reduce((s, i) => s + i.amount, 0);

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
  const totalMonthly = items.filter((i) => i.enabled && i.cycle !== 'yearly').reduce((s, i) => s + i.amount, 0);

  return (
    <div className={styles.page}>
      {/* ── 상단 바 ── */}
      <div className={styles.topBar}>
        <h1 className={styles.pageTitle}>정기지출 · 구독 · 할부</h1>
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
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
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
                  const daysUntil = Math.ceil((new Date(item.nextDueDate).getTime() - new Date(todayStr).getTime()) / (1000 * 60 * 60 * 24));
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
                        <span className={styles.upcomingMeta}>{cat?.name ?? '미분류'} · {KIND_LABELS[item.kind]}</span>
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
            placeholder="예: 넷플릭스"
            required
          />

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
