// Router — RESET Budget
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from './routes';
import {
  RequireAuth,
  RequireNoAuth,
  RequireOnboarding,
  RequireNotOnboarded,
} from './RouteGuard';
import { AppShell } from '../components/layout/AppShell';
import { OnboardingProvider } from '../pages/onboarding/OnboardingContext';

/** 온보딩 라우트용 레이아웃: Provider + Outlet */
function OnboardingOutlet() {
  return (
    <OnboardingProvider>
      <Outlet />
    </OnboardingProvider>
  );
}

import { LoginPage } from '../pages/auth/LoginPage';

import { OnboardingStep1Page } from '../pages/onboarding/OnboardingStep1Page';
import { OnboardingStep2Page } from '../pages/onboarding/OnboardingStep2Page';
import { OnboardingStep3Page } from '../pages/onboarding/OnboardingStep3Page';
import { OnboardingStep4Page } from '../pages/onboarding/OnboardingStep4Page';
import { OnboardingStep5Page } from '../pages/onboarding/OnboardingStep5Page';

import { HomePage }         from '../pages/home/HomePage';
import { RecordPage }       from '../pages/record/RecordPage';
import { BudgetPage }       from '../pages/budget/BudgetPage';
import { RecurringPage }    from '../pages/recurring/RecurringPage';
import { SafetyPage }       from '../pages/safety/SafetyPage';
import { StatsMonthlyPage } from '../pages/stats/StatsMonthlyPage';
import { StatsAnnualPage }  from '../pages/stats/StatsAnnualPage';
import { SettlementPage }   from '../pages/settlement/SettlementPage';
import { ResetPage }        from '../pages/reset/ResetPage';
import { SettingsPage }     from '../pages/settings/SettingsPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인 — 인증된 사용자는 홈으로 redirect */}
        <Route
          path={ROUTES.login}
          element={<RequireNoAuth><LoginPage /></RequireNoAuth>}
        />

        {/* 온보딩 — 인증 필요 + OnboardingProvider 공유 */}
        <Route
          element={
            <RequireAuth>
              <RequireNotOnboarded>
                <OnboardingOutlet />
              </RequireNotOnboarded>
            </RequireAuth>
          }
        >
          <Route path={ROUTES.onboarding} element={<Navigate to={ROUTES.onboardingStep1} replace />} />
          <Route path={ROUTES.onboardingStep1} element={<OnboardingStep1Page />} />
          <Route path={ROUTES.onboardingStep2} element={<OnboardingStep2Page />} />
          <Route path={ROUTES.onboardingStep3} element={<OnboardingStep3Page />} />
          <Route path={ROUTES.onboardingStep4} element={<OnboardingStep4Page />} />
          <Route path={ROUTES.onboardingStep5} element={<OnboardingStep5Page />} />
        </Route>

        {/* 메인 앱 — 인증 + 온보딩 완료 필요 */}
        <Route element={<RequireAuth><RequireOnboarding><AppShell /></RequireOnboarding></RequireAuth>}>
          <Route path={ROUTES.home}         element={<HomePage />} />
          <Route path={ROUTES.record}       element={<RecordPage />} />
          <Route path={ROUTES.budget}       element={<BudgetPage />} />
          <Route path={ROUTES.recurring}    element={<RecurringPage />} />
          <Route path={ROUTES.safety}       element={<SafetyPage />} />
          <Route path="/stats"              element={<Navigate to={ROUTES.statsMonthly} replace />} />
          <Route path={ROUTES.statsMonthly} element={<StatsMonthlyPage />} />
          <Route path={ROUTES.statsAnnual}  element={<StatsAnnualPage />} />
          <Route path={ROUTES.settlement}   element={<SettlementPage />} />
          <Route path={ROUTES.reset}        element={<ResetPage />} />
          <Route path={ROUTES.settings}     element={<SettingsPage />} />
        </Route>

        {/* 기본 redirect */}
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
