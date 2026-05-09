// OnboardingStep4Page — 저축 목표

import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { OnboardingLayout } from './OnboardingLayout';
import { useOnboarding } from './OnboardingContext';
import { AmountInput } from '../../components/ui/AmountInput';
import { Button } from '../../components/ui/Button';

export function OnboardingStep4Page() {
  const navigate = useNavigate();
  const { draft, updateDraft } = useOnboarding();

  return (
    <OnboardingLayout
      step={4}
      title="저축 목표"
      subtitle="이번 달 저축하고 싶은 금액을 설정해주세요. 예산 계산 시 자동으로 차감됩니다."
      footer={
        <>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => navigate(ROUTES.onboardingStep5)}
          >
            다음 →
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => navigate(ROUTES.onboardingStep5)}
          >
            건너뛰기
          </Button>
        </>
      }
    >
      <AmountInput
        label="이번 달 저축 목표"
        value={draft.savingsTargetDefault}
        onChange={(v) => updateDraft({ savingsTargetDefault: v })}
        placeholder="0"
        hint="목표 금액은 생활비 예산에서 자동으로 차감됩니다."
      />
    </OnboardingLayout>
  );
}
