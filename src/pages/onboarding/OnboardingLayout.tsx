// OnboardingLayout — 온보딩 공통 레이아웃 (진행 표시 + 네비게이션)

import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import styles from './OnboardingLayout.module.css';

const STEP_ROUTES = [
  ROUTES.onboardingStep1,
  ROUTES.onboardingStep2,
  ROUTES.onboardingStep3,
  ROUTES.onboardingStep4,
  ROUTES.onboardingStep5,
] as const;

interface OnboardingLayoutProps {
  step: 1 | 2 | 3 | 4 | 5;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** 하단 버튼 영역 (다음/건너뛰기 등 직접 렌더링) */
  footer: React.ReactNode;
}

export function OnboardingLayout({
  step,
  title,
  subtitle,
  children,
  footer,
}: OnboardingLayoutProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (step > 1) navigate(STEP_ROUTES[step - 2]);
  };

  return (
    <div className={styles.container}>
      {/* 상단 헤더 */}
      <div className={styles.header}>
        {step > 1 ? (
          <button
            className={styles.backBtn}
            onClick={handleBack}
            type="button"
            aria-label="이전 단계"
          >
            ←
          </button>
        ) : (
          <span />
        )}

        {/* 진행 표시 점 */}
        <div className={styles.dots} aria-label={`${step}단계 / 5단계`}>
          {STEP_ROUTES.map((_, i) => (
            <span
              key={i}
              className={[styles.dot, i + 1 === step ? styles.dotActive : '']
                .filter(Boolean)
                .join(' ')}
            />
          ))}
        </div>

        <span className={styles.stepLabel}>{step} / 5</span>
      </div>

      {/* 타이틀 */}
      <div className={styles.titleArea}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      {/* 스크롤 콘텐츠 영역 */}
      <div className={styles.body}>{children}</div>

      {/* 하단 고정 버튼 */}
      <div className={styles.footer}>{footer}</div>
    </div>
  );
}
