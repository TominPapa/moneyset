// TransactionItem — 거래 목록 단일 항목
// V1.5: 스와이프 삭제 (모바일) + 클릭 수정

import { useRef, useState } from 'react';
import type { Transaction, Category } from '../../domain/types';
import styles from './TransactionItem.module.css';

interface TransactionItemProps {
  tx: Transaction;
  category?: Category;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}

const SWIPE_THRESHOLD = 72; // px — 이 거리 이상 좌로 당기면 삭제 확인
const SWIPE_FULL     = 80; // px — 삭제 버튼 노출 너비

export function TransactionItem({ tx, category, onEdit, onDelete }: TransactionItemProps) {
  const isIncome = tx.entryKind === 'income';

  // ── 스와이프 상태 ────────────────────────────────────────────────────────────
  const [offsetX, setOffsetX]   = useState(0);   // 현재 drag 오프셋 (음수 = 왼쪽)
  const [revealed, setRevealed] = useState(false); // 삭제 버튼 완전 노출 여부
  const touchStartX = useRef<number | null>(null);
  const startOffset = useRef(0);
  const dragging    = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    startOffset.current = offsetX;
    dragging.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const next = Math.max(-SWIPE_FULL, Math.min(0, startOffset.current + dx));
    if (Math.abs(dx) > 6) {
      dragging.current = true;
      setOffsetX(next);
    }
  }

  function onTouchEnd() {
    touchStartX.current = null;
    if (!dragging.current) return;
    if (offsetX <= -SWIPE_THRESHOLD) {
      // 충분히 당겼으면 버튼 완전 노출
      setOffsetX(-SWIPE_FULL);
      setRevealed(true);
    } else {
      // 원위치 복귀
      setOffsetX(0);
      setRevealed(false);
    }
    dragging.current = false;
  }

  function closeSwipe() {
    setOffsetX(0);
    setRevealed(false);
  }

  function handleItemClick() {
    if (revealed) {
      // 스와이프 열려있으면 클릭 시 닫기
      closeSwipe();
      return;
    }
    onEdit(tx);
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(tx.id);
  }

  // ── 키보드 접근성 ────────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (revealed) { closeSwipe(); return; }
      onEdit(tx);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(tx.id);
    }
  }

  return (
    <div className={styles.wrapper} aria-label={`${tx.title} ${tx.amount.toLocaleString('ko-KR')}원`}>
      {/* 삭제 버튼 (스와이프로 노출) */}
      <button
        className={styles.deleteAction}
        onClick={handleDeleteClick}
        aria-label={`${tx.title} 삭제`}
        tabIndex={revealed ? 0 : -1}
      >
        삭제
      </button>

      {/* 거래 아이템 본체 */}
      <div
        className={styles.item}
        style={{ transform: `translateX(${offsetX}px)` }}
        onClick={handleItemClick}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* 카테고리 아이콘 */}
        <div className={styles.iconWrapper} aria-hidden="true">
          {category?.icon ?? '📋'}
        </div>

        {/* 내용 */}
        <div className={styles.info}>
          <span className={styles.title}>{tx.title}</span>
          <span className={styles.meta}>
            {category?.name ?? '미분류'}
            {tx.memo ? ` · ${tx.memo}` : ''}
          </span>
        </div>

        {/* 금액 */}
        <div className={styles.amountWrapper}>
          <span className={[styles.amount, isIncome ? styles.income : styles.expense].join(' ')}>
            {isIncome ? '+' : '-'}{tx.amount.toLocaleString('ko-KR')}원
          </span>
        </div>
      </div>
    </div>
  );
}
