// OnboardingStep5Page — 예산 미리보기 + 완료

import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { OnboardingLayout } from './OnboardingLayout';
import { useOnboarding } from './OnboardingContext';
import { Button } from '../../components/ui/Button';
import styles from './OnboardingStep5Page.module.css';

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function OnboardingStep5Page() {
  const navigate = useNavigate();
  const { draft, complete, isCompleting, completeError } = useOnboarding();

  const totalBalance = draft.accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalFixed = draft.liabilities.reduce((sum, l) => sum + l.monthlyAmount, 0);
  const monthlySpendable =
    draft.expectedNetIncomeDefault - totalFixed - draft.savingsTargetDefault;

  const handleComplete = async () => {
    try {
      await complete();
      navigate(ROUTES.home, { replace: true });
    } catch {
      // completeError가 컨텍스트에 세팅됨
    }
  };

  return (
    <OnboardingLayout
      step={5}
      title="예산 확인"
      subtitle="입력한 정보를 바탕으로 이번 달 예산이 계산되었습니다."
      footer={
        <>
          {completeError && (
            <p className={styles.error} role="alert">{completeError}</p>
          )}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleComplete}
            loading={isCompleting}
          >
            이대로 시작하기
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => navigate(ROUTES.onboardingStep1)}
            disabled={isCompleting}
          >
            ← 다시 수정하기
          </Button>
        </>
      }
    >
      {/* 핵심 지표 */}
      <div className={styles.heroCard}>
        <p className={styles.heroLabel}>이번 달 생활비</p>
        <p className={[styles.heroAmount, monthlySpendable < 0 ? styles.heroAmountNegative : ''].filter(Boolean).join(' ')}>
          {fmt(monthlySpendable)}원
        </p>
        {monthlySpendable < 0 && (
          <p className={styles.heroWarning}>
            고정지출과 저축 목표가 수입을 초과합니다. 항목을 조정해주세요.
          </p>
        )}
      </div>

      {/* 요약 카드들 */}
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>월 수입</span>
          <span className={styles.cardValue}>{fmt(draft.expectedNetIncomeDefault)}원</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>총 자산</span>
          <span className={styles.cardValue}>{fmt(totalBalance)}원</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>월 고정지출</span>
          <span className={[styles.cardValue, styles.expenseValue].join(' ')}>
            {fmt(totalFixed)}원
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>저축 목표</span>
          <span className={styles.cardValue}>{fmt(draft.savingsTargetDefault)}원</span>
        </div>
      </div>

      {/* 고정지출 상세 */}
      {draft.liabilities.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>고정지출 항목</p>
          <ul className={styles.itemList}>
            {draft.liabilities.map((l) => (
              <li key={l.id} className={styles.listItem}>
                <span className={styles.listItemName}>{l.name}</span>
                <span className={styles.listItemAmount}>{fmt(l.monthlyAmount)}원</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </OnboardingLayout>
  );
}
