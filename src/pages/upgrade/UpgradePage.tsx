// UpgradePage — RESET Budget
// 티어 업그레이드 / 후원 코드 입력 페이지

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../app/store/appStore';
import { tierLabel, tierColor, type UserTier } from '../../domain/tiers';
import { ROUTES } from '../../app/routes';
import styles from './UpgradePage.module.css';

// ─── 플랜 카드 데이터 ────────────────────────────────────────────────────────

interface PlanCard {
  tier: UserTier;
  name: string;
  price: string;
  desc: string;
  features: string[];
  locked: string[];
  highlight?: boolean;
}

const PLANS: PlanCard[] = [
  {
    tier: 'basic',
    name: '기본 팩',
    price: '₩15,000',
    desc: '가계부 기본 기능으로 시작해보고 싶은 분께',
    features: [
      '거래 기록 / 예산 관리',
      '카테고리 커스터마이징',
      '정기지출 / 자산·부채 관리',
      '구글 드라이브 동기화',
    ],
    locked: [
      '공백 리셋 기능',
      '재무 안전도 지수',
      '공동정산 기능',
      '통계 리포트',
      '부채 관리 탭',
    ],
  },
  {
    tier: 'allinone',
    name: '올인원 팩',
    price: '₩35,000',
    desc: '머니셋의 모든 핵심 기능을 제대로 쓰고 싶다면',
    features: [
      '기본 팩의 모든 기능',
      '공백 리셋 기능',
      '재무 안전도 지수',
      '공동정산 기능',
      '통계 리포트',
      '부채 관리 탭',
      '향후 업데이트 무상 제공',
    ],
    locked: [],
    highlight: true,
  },
  {
    tier: 'couple',
    name: '커플·가족 팩',
    price: '₩45,000',
    desc: '함께 쓰는 두 사람을 위한 2인용 패키지',
    features: [
      '올인원 팩의 모든 기능',
      '2인 계정 지급',
      '향후 업데이트 무상 제공',
    ],
    locked: [],
  },
];

// ─── 기능 목록 ──────────────────────────────────────────────────────────────

const BASIC_FEATURES = [
  { icon: '📝', label: '거래 기록 / 예산 관리' },
  { icon: '🏷️', label: '카테고리 커스터마이징' },
  { icon: '🔄', label: '정기지출 / 자산·부채 관리' },
  { icon: '☁️', label: '구글 드라이브 동기화' },
];

const ALLINONE_EXTRA = [
  { icon: '🔄', label: '공백 리셋 기능' },
  { icon: '🛡️', label: '재무 안전도 지수' },
  { icon: '🤝', label: '공동정산 기능' },
  { icon: '📊', label: '통계 리포트' },
  { icon: '💳', label: '부채 관리 탭' },
  { icon: '🎁', label: '향후 업데이트 무상 제공' },
];

// ═══════════════════════════════════════════════════════════════════════════════

export function UpgradePage() {
  const navigate       = useNavigate();
  const userTier       = useAppStore((s) => s.userTier);
  const unlockWithCode = useAppStore((s) => s.unlockWithCode);

  const [code, setCode]       = useState('');
  const [status, setStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [newTier, setNewTier] = useState<UserTier | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const isFree = userTier === 'free';

  async function handleActivate() {
    if (!code.trim()) return;
    setStatus('loading');
    setErrorMessage('');
    try {
      const result = await unlockWithCode(code);
      if (result) {
        setNewTier(result);
        setStatus('success');
      } else {
        setErrorMessage('인증에 실패했습니다. 코드를 다시 확인해 주세요.');
        setStatus('error');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '인증 코드 검증 중 오류가 발생했습니다.');
      setStatus('error');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleActivate();
  }

  if (status === 'success' && newTier) {
    return (
      <div className={styles.page}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>🎉</div>
          <h2 className={styles.successTitle}>활성화 완료!</h2>
          <p className={styles.successDesc}>
            <span style={{ color: tierColor(newTier), fontWeight: 700 }}>
              {tierLabel(newTier)}
            </span>
            으로 업그레이드되었습니다.
          </p>
          <button
            className={styles.goHomeBtn}
            onClick={() => navigate(ROUTES.home, { replace: true })}
            type="button"
          >
            앱 시작하기 →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      {/* ── 헤더 ── */}
      <div className={styles.header}>
        {!isFree && (
          <button className={styles.backBtn} onClick={() => navigate(-1)} type="button">
            ← 돌아가기
          </button>
        )}
        <div className={styles.currentTierBadge} style={{ color: tierColor(userTier) }}>
          현재 플랜: {tierLabel(userTier)}
        </div>
        <h1 className={styles.title}>
          {isFree ? '머니셋을 시작해보세요' : '플랜 업그레이드'}
        </h1>
        <p className={styles.subtitle}>
          텀블벅에서 발급된 후원 코드를 입력해 기능을 활성화하세요.
        </p>
      </div>

      {/* ── 코드 입력 ── */}
      <div className={styles.codeSection}>
        <div className={styles.codeLabel}>후원 코드 입력</div>
        <div className={styles.codeRow}>
          <input
            className={`${styles.codeInput} ${status === 'error' ? styles.codeInputError : ''}`}
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setStatus('idle'); }}
            onKeyDown={handleKeyDown}
            placeholder="예: BASIC-XXXX 또는 AOI-XXXX"
            maxLength={20}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className={styles.activateBtn}
            onClick={handleActivate}
            disabled={status === 'loading' || !code.trim()}
            type="button"
          >
            {status === 'loading' ? '확인 중…' : '활성화'}
          </button>
        </div>
        {status === 'error' && (
          <p className={styles.errorMsg}>
            {errorMessage || '유효하지 않은 코드입니다. 텀블벅 메시지함을 다시 확인해주세요.'}
          </p>
        )}
        <p className={styles.codeHint}>
          💬 텀블벅 메시지함에서 발급된 코드를 확인하세요.
        </p>
      </div>

      {/* ── 플랜 비교 ── */}
      <div className={styles.plansSection}>
        <div className={styles.plansTitle}>플랜 비교</div>
        <div className={styles.planCards}>
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`${styles.planCard} ${plan.highlight ? styles.planCardHighlight : ''}`}
            >
              {plan.highlight && (
                <div className={styles.popularBadge}>⭐ MOST POPULAR</div>
              )}
              <div className={styles.planName}>{plan.name}</div>
              <div className={styles.planPrice}>{plan.price}</div>
              <div className={styles.planDesc}>{plan.desc}</div>

              <div className={styles.featureList}>
                {plan.features.map((f) => (
                  <div key={f} className={styles.featureItem}>
                    <span className={styles.featureCheck}>✓</span>
                    <span>{f}</span>
                  </div>
                ))}
                {plan.locked.map((f) => (
                  <div key={f} className={`${styles.featureItem} ${styles.featureLocked}`}>
                    <span className={styles.featureCross}>✗</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 기능 요약 ── */}
      <div className={styles.featureSummary}>
        <div className={styles.summaryCol}>
          <div className={styles.summaryColTitle}>기본 팩 포함</div>
          {BASIC_FEATURES.map((f) => (
            <div key={f.label} className={styles.summaryItem}>
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.summaryDivider}>+</div>
        <div className={styles.summaryCol}>
          <div className={styles.summaryColTitle} style={{ color: 'var(--mint-500, #10b981)' }}>
            올인원 팩 추가
          </div>
          {ALLINONE_EXTRA.map((f) => (
            <div key={f.label} className={styles.summaryItem}>
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
