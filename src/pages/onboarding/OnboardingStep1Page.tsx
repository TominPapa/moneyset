// OnboardingStep1Page — 기본 설정 (월 기준 / 주 시작 / 테마)

import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { OnboardingLayout } from './OnboardingLayout';
import { useOnboarding } from './OnboardingContext';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../app/store/appStore';
import styles from './OnboardingStep1Page.module.css';

const WEEK_DAY_OPTIONS = [
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
  { value: 0, label: '일요일' },
];

const PAYDAY_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}일`,
}));

export function OnboardingStep1Page() {
  const navigate = useNavigate();
  const { draft, updateDraft } = useOnboarding();
  const setTheme = useAppStore((s) => s.setTheme);

  const handleNext = () => {
    navigate(ROUTES.onboardingStep2);
  };

  const handleThemeToggle = (mode: 'noir_black' | 'ivory_light') => {
    updateDraft({ themeMode: mode });
    setTheme(mode); // 즉시 미리보기
  };

  return (
    <OnboardingLayout
      step={1}
      title="기본 설정"
      subtitle="예산 기간과 주 시작 요일, 테마를 설정해주세요."
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleNext}
        >
          다음 →
        </Button>
      }
    >
      {/* 월 기준 */}
      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>월 기준</p>
        <div className={styles.radioGroup}>
          <label className={styles.radioItem}>
            <input
              type="radio"
              name="monthMode"
              value="calendar"
              checked={draft.monthMode === 'calendar'}
              onChange={() => updateDraft({ monthMode: 'calendar' })}
            />
            <span className={styles.radioText}>
              <strong>달력 월</strong>
              <small>1일 ~ 말일 기준</small>
            </span>
          </label>
          <label className={styles.radioItem}>
            <input
              type="radio"
              name="monthMode"
              value="payday"
              checked={draft.monthMode === 'payday'}
              onChange={() => updateDraft({ monthMode: 'payday' })}
            />
            <span className={styles.radioText}>
              <strong>급여일 기준</strong>
              <small>급여일 다음 날부터 다음 급여일까지</small>
            </span>
          </label>
        </div>

        {draft.monthMode === 'payday' && (
          <Select
            label="급여일"
            value={draft.payday}
            options={PAYDAY_OPTIONS}
            onChange={(e) => updateDraft({ payday: Number(e.target.value) })}
          />
        )}
      </div>

      {/* 주 시작 요일 */}
      <Select
        label="주 시작 요일"
        value={draft.weekStartDay}
        options={WEEK_DAY_OPTIONS}
        onChange={(e) =>
          updateDraft({ weekStartDay: Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6 })
        }
      />

      {/* 테마 */}
      <div className={styles.fieldGroup}>
        <p className={styles.fieldLabel}>테마</p>
        <div className={styles.themeToggle}>
          <button
            type="button"
            className={[
              styles.themeBtn,
              draft.themeMode === 'noir_black' ? styles.themeBtnActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleThemeToggle('noir_black')}
          >
            🌙 어두운
          </button>
          <button
            type="button"
            className={[
              styles.themeBtn,
              draft.themeMode === 'ivory_light' ? styles.themeBtnActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleThemeToggle('ivory_light')}
          >
            ☀️ 밝은
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
