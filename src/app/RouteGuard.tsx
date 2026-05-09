// RouteGuard — RESET Budget
// isAuthenticated / onboardingCompleted 기준으로 접근 제어

import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { ROUTES } from './routes';

interface Props {
  children: React.ReactNode;
}

/** 미인증 사용자 → /login 으로 리다이렉트 */
export function RequireAuth({ children }: Props) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/** 이미 인증된 사용자가 /login 접근 시 → 홈으로 리다이렉트 */
export function RequireNoAuth({ children }: Props) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to={ROUTES.home} replace />;
  }
  return <>{children}</>;
}

/** 온보딩 미완료 사용자 → /onboarding/step1 으로 리다이렉트 */
export function RequireOnboarding({ children }: Props) {
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);
  const location = useLocation();

  if (!onboardingCompleted) {
    return <Navigate to={ROUTES.onboardingStep1} state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/** 온보딩 완료된 사용자가 온보딩 페이지 접근 시 → 홈으로 리다이렉트 */
export function RequireNotOnboarded({ children }: Props) {
  const onboardingCompleted = useAppStore((s) => s.onboardingCompleted);

  if (onboardingCompleted) {
    return <Navigate to={ROUTES.home} replace />;
  }
  return <>{children}</>;
}
