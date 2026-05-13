// DebtPage — 부채 관리
// 기본: 전체 사용자 / 상세 분석: supporter 티어 이상

import { useState } from 'react';
import { useAppStore } from '../../app/store/appStore';
import type { Liability } from '../../domain/types';
import styles from './DebtPage.module.css';

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString('ko-KR') + '원'; }
function fmtShort(n: number): string {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '억';
  if (n >= 10_000)      return (n / 10_000).toFixed(0) + '만';
  return n.toLocaleString('ko-KR');
}

const LIABILITY_KIND_LABELS: Record<string, string> = {
  loan:                  '대출',
  installment:           '할부',
  rent:                  '월세',
  credit_card_recurring: '카드대금',
};

const LIABILITY_KIND_COLORS: Record<string, string> = {
  loan:                  '#F47272',
  installment:           '#D9B26A',
  rent:                  '#9DB6F0',
  credit_card_recurring: '#C9A6F0',
};

function repayPct(item: Liability): number {
  if (!item.totalBalance || !item.remainingMonths || !item.monthlyAmount) return 0;
  const originalTotal = item.totalBalance + item.monthlyAmount * item.remainingMonths;
  if (originalTotal <= 0) return 0;
  return Math.min(100, Math.round((item.monthlyAmount * item.remainingMonths / originalTotal) * 100));
}

// ─── 잠금 오버레이 ─────────────────────────────────────────────────────────────

function LockedSection({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className={styles.lockedSection}>
      <div className={styles.lockedBlur} />
      <div className={styles.lockedContent}>
        <div className={styles.lockedIcon}>✦</div>
        <div className={styles.lockedTitle}>후원자 전용 기능</div>
        <div className={styles.lockedDesc}>
          부채 상환 타임라인, 부채 비율 분석, 상환 전략 추천은<br />
          텀블벅 후원자에게 제공되는 기능입니다.
        </div>
        <button className={styles.lockedBtn} type="button" onClick={onUnlock}>
          후원자 코드 입력하기
        </button>
      </div>
    </div>
  );
}

// ─── 상환 타임라인 (supporter) ────────────────────────────────────────────────

function effectiveMonths(item: Liability): number {
  if (item.remainingMonths && item.remainingMonths > 0) return item.remainingMonths;
  if (item.totalBalance && item.monthlyAmount > 0) return Math.ceil(item.totalBalance / item.monthlyAmount);
  return 0;
}

function effectivePayoffDate(item: Liability): string {
  const months = effectiveMonths(item);
  if (months <= 0) return '—';
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

function PayoffTimeline({ liabilities }: { liabilities: Liability[] }) {
  if (liabilities.length === 0) return (
    <p className={styles.empty}>등록된 부채가 없습니다.</p>
  );

  const withMonths = liabilities.filter(l => effectiveMonths(l) > 0);

  // 기간 있는 부채 먼저(짧은 순), 없는 부채는 뒤로
  const sorted = [
    ...withMonths.sort((a, b) => effectiveMonths(a) - effectiveMonths(b)),
    ...liabilities.filter(l => effectiveMonths(l) === 0),
  ];

  return (
    <div className={styles.timelineList}>
      {sorted.map(item => {
        const months = effectiveMonths(item);
        const color  = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
        const isCalc = !item.remainingMonths && item.totalBalance;
        const noDate = months === 0;
        return (
          <div key={item.id} className={styles.timelineCard}>
            {/* 왼쪽 컬러 바 */}
            <div className={styles.timelineAccent} style={{ background: color }} />
            <div className={styles.timelineBody}>
              <div className={styles.timelineRow}>
                <span className={styles.timelineName} style={{ color }}>{item.name}</span>
                <span className={styles.timelineKind}>{LIABILITY_KIND_LABELS[item.kind] ?? item.kind}</span>
              </div>
              <div className={styles.timelineRow} style={{ marginTop: 8 }}>
                {noDate ? (
                  <span className={styles.timelineNoDate}>상환 기간 미설정</span>
                ) : (
                  <>
                    <span className={styles.timelineMonths}>{months}개월 후 완납</span>
                    <span className={styles.timelineDateBadge}>
                      {effectivePayoffDate(item)}
                      {isCalc && <span style={{ color: 'var(--text-3)', fontSize: 10, marginLeft: 4 }}>(추정)</span>}
                    </span>
                  </>
                )}
              </div>
              {item.totalBalance && (
                <div className={styles.timelineBalance}>
                  잔여 원금 <strong>{fmt(item.totalBalance)}</strong>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 부채/자산 비율 게이지 (supporter) ───────────────────────────────────────

function DebtRatioGauge({ liabilities, accounts }: {
  liabilities: Liability[];
  accounts: { balance: number; isActive: boolean }[];
}) {
  const totalDebt   = liabilities.filter(l => l.isActive && l.totalBalance).reduce((s, l) => s + (l.totalBalance ?? 0), 0);
  const totalAssets = accounts.filter(a => a.isActive).reduce((s, a) => s + a.balance, 0);
  const ratio       = totalAssets > 0 ? Math.min(100, Math.round((totalDebt / totalAssets) * 100)) : 0;
  const isHealthy   = ratio < 30;
  const isWarning   = ratio >= 30 && ratio < 60;

  const gaugeColor = isHealthy ? 'var(--mint-500)' : isWarning ? 'var(--gold-500)' : '#F47272';
  const gaugeLabel = isHealthy ? '건강' : isWarning ? '주의' : '위험';

  // 인디케이터 점 위치 계산 (반원: 왼쪽 180° → 오른쪽 0°)
  const dotAngle = ((180 - 180 * (ratio / 100)) * Math.PI) / 180;
  const dotX = 90 + 80 * Math.cos(dotAngle);
  const dotY = 90 - 80 * Math.sin(dotAngle);

  return (
    <div className={styles.ratioCard}>
      <div className={styles.ratioGaugeWrap}>
        {/* 반원 게이지 */}
        <svg width="180" height="100" viewBox="0 0 180 100">
          <defs>
            <filter id="gaugeDot" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {/* 배경 트랙 */}
          <path d="M 10 90 A 80 80 0 0 1 170 90" fill="none" stroke="var(--bg-0)" strokeWidth="12" strokeLinecap="round"/>
          {/* 채워진 호 */}
          <path d="M 10 90 A 80 80 0 0 1 170 90" fill="none" stroke={gaugeColor}
            strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(ratio / 100) * 251.2} 251.2`}
          />
          {/* 위치 인디케이터 점 */}
          {ratio > 0 && (
            <circle cx={dotX} cy={dotY} r="8" fill={gaugeColor} filter="url(#gaugeDot)" />
          )}
          {/* 중앙 텍스트 */}
          <text x="90" y="76" textAnchor="middle" fill={gaugeColor} fontSize="24" fontWeight="700">{ratio}%</text>
          <text x="90" y="91" textAnchor="middle" fill="var(--text-2)" fontSize="11">{gaugeLabel}</text>
        </svg>
      </div>
      <div className={styles.ratioStats}>
        <div className={styles.ratioStat}>
          <span className={styles.ratioStatLabel}>총 자산</span>
          <span className={styles.ratioStatValue} style={{ color: 'var(--mint-300)' }}>{fmt(totalAssets)}</span>
        </div>
        <div className={styles.ratioStat}>
          <span className={styles.ratioStatLabel}>총 부채</span>
          <span className={styles.ratioStatValue} style={{ color: '#F47272' }}>{fmt(totalDebt)}</span>
        </div>
        <div className={styles.ratioStat}>
          <span className={styles.ratioStatLabel}>순자산</span>
          <span className={styles.ratioStatValue} style={{ color: totalAssets - totalDebt >= 0 ? 'var(--text-0)' : '#F47272' }}>
            {totalAssets - totalDebt >= 0 ? '+' : ''}{fmt(totalAssets - totalDebt)}
          </span>
        </div>
      </div>
      <div className={styles.ratioHint}>
        {isHealthy ? '✓ 부채 비율이 건강한 수준입니다 (30% 미만)' :
         isWarning ? '⚠ 부채 비율이 높습니다. 상환 속도를 높이는 것을 권장합니다.' :
                    '⛔ 부채가 자산의 60%를 초과했습니다. 즉시 관리가 필요합니다.'}
      </div>
    </div>
  );
}

// ─── DebtPage ─────────────────────────────────────────────────────────────────

export function DebtPage() {
  const liabilities = useAppStore(s => s.liabilities);
  const accounts    = useAppStore(s => s.accounts);
  const userTier    = useAppStore(s => s.userTier);
  const isSupporter = userTier === 'supporter';

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockCode, setUnlockCode]           = useState('');
  const [unlockError, setUnlockError]         = useState('');
  const [unlocking, setUnlocking]             = useState(false);
  const unlockSupporter = useAppStore(s => s.unlockSupporter);

  const active        = liabilities.filter(l => l.isActive);
  const totalMonthly  = active.reduce((s, l) => s + l.monthlyAmount, 0);
  const totalBalance  = active.filter(l => l.totalBalance).reduce((s, l) => s + (l.totalBalance ?? 0), 0);
  const loanCount     = active.filter(l => l.kind === 'loan').length;
  const installCount  = active.filter(l => l.kind === 'installment').length;

  async function handleUnlock() {
    setUnlocking(true);
    setUnlockError('');
    const ok = await unlockSupporter(unlockCode);
    setUnlocking(false);
    if (ok) {
      setShowUnlockModal(false);
      setUnlockCode('');
    } else {
      setUnlockError('코드가 올바르지 않습니다. 텀블벅 메시지를 확인해주세요.');
    }
  }

  return (
    <div className={styles.page}>

      {/* ── 상단 헤더 ── */}
      <div className={styles.topBar}>
        <div>
          <div className={styles.topSubtitle}>DEBT MANAGEMENT</div>
          <div className={styles.topTitle}>부채 관리</div>
        </div>
        {isSupporter && (
          <div className={styles.tierBadge}>✦ 후원자</div>
        )}
      </div>

      <div className={styles.scroll}>

        {/* ── 요약 카드 3개 ── */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>월 납입 합계</div>
            <div className={styles.summaryValue} style={{ color: '#F47272' }}>{fmt(totalMonthly)}</div>
            <div className={styles.summaryHint}>매월 고정 지출</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>총 잔여 원금</div>
            <div className={styles.summaryValue}>{totalBalance > 0 ? fmt(totalBalance) : '—'}</div>
            <div className={styles.summaryHint}>{active.length}건 활성 부채</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>부채 종류</div>
            <div className={styles.summaryValue} style={{ fontSize: 20 }}>
              {loanCount > 0 && `대출 ${loanCount}건 `}
              {installCount > 0 && `할부 ${installCount}건`}
              {loanCount === 0 && installCount === 0 && (active.length > 0 ? `${active.length}건` : '없음')}
            </div>
            <div className={styles.summaryHint}>
              {active.filter(l => effectiveMonths(l) > 0).length > 0
                ? `최장 ${Math.max(...active.filter(l => effectiveMonths(l) > 0).map(l => effectiveMonths(l)))}개월 남음`
                : '상환 기간 미설정'}
            </div>
          </div>
        </div>

        {/* ── 부채 목록 ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>부채 목록</div>
          {active.length === 0 ? (
            <div className={styles.emptyState}>
              <p>등록된 부채가 없습니다.</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                설정 → 자산·부채에서 추가할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className={styles.debtList}>
              {active.map(item => {
                const color  = LIABILITY_KIND_COLORS[item.kind] ?? '#8F8D85';
                return (
                  <div key={item.id} className={styles.debtItem}>
                    <div className={styles.debtKindDot} style={{ background: color }} />
                    <div className={styles.debtInfo}>
                      <div className={styles.debtRow}>
                        <span className={styles.debtName}>{item.name}</span>
                        <span className={styles.debtKindBadge} style={{ color, borderColor: `${color}44`, background: `${color}11` }}>
                          {LIABILITY_KIND_LABELS[item.kind] ?? item.kind}
                        </span>
                      </div>
                      <div className={styles.debtMeta}>
                        <span>월 {fmt(item.monthlyAmount)}</span>
                        {item.totalBalance && <span>잔여 {fmtShort(item.totalBalance)}원</span>}
                        {item.remainingMonths && <span>{item.remainingMonths}개월 남음</span>}
                        <span>납입일 {item.dueDay}일</span>
                      </div>
                      {effectiveMonths(item) > 0 && (
                        <div className={styles.debtBarWrap}>
                          {/* 상환 진행 바: remainingMonths + totalBalance 둘 다 있을 때만 */}
                          {item.remainingMonths && item.totalBalance && repayPct(item) > 0 && (
                            <div className={styles.debtBarTrack}>
                              <div className={styles.debtBarFill}
                                style={{ width: `${100 - repayPct(item)}%`, background: color }} />
                            </div>
                          )}
                          <span className={styles.debtBarLabel}>
                            {effectivePayoffDate(item)} 완납 예정
                            {!item.remainingMonths && <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>(잔여원금 기준 추정)</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 상환 타임라인 (전체 공개) ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>상환 타임라인</div>
          <PayoffTimeline liabilities={liabilities} />
        </div>

        {/* ── 부채/자산 비율 (supporter 전용) ── */}
        <div className={styles.section} style={{ position: 'relative' }}>
          <div className={styles.sectionTitle}>
            부채 / 자산 비율
            {!isSupporter && <span className={styles.lockTag}>✦ 후원자 전용</span>}
          </div>

          <div style={{ opacity: isSupporter ? 1 : 0.2, pointerEvents: isSupporter ? 'auto' : 'none' }}>
            <DebtRatioGauge liabilities={liabilities} accounts={accounts} />
          </div>

          {!isSupporter && (
            <LockedSection onUnlock={() => setShowUnlockModal(true)} />
          )}
        </div>

      </div>

      {/* ── 코드 입력 모달 ── */}
      {showUnlockModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowUnlockModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>✦ 후원자 코드 입력</div>
            <p className={styles.modalDesc}>
              텀블벅 후원자에게 발송된 코드를 입력하면<br />
              부채 상세 분석 기능이 활성화됩니다.
            </p>
            <input
              className={styles.codeInput}
              type="text"
              placeholder="코드를 입력하세요"
              value={unlockCode}
              onChange={e => { setUnlockCode(e.target.value.toUpperCase()); setUnlockError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              autoFocus
            />
            {unlockError && <p className={styles.codeError}>{unlockError}</p>}
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} type="button" onClick={() => setShowUnlockModal(false)}>취소</button>
              <button className={styles.modalConfirmBtn} type="button" onClick={handleUnlock} disabled={unlocking || !unlockCode.trim()}>
                {unlocking ? '확인 중…' : '활성화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
