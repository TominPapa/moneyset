// RouteGuard — RESET Budget
// isAuthenticated / onboardingCompleted / userTier 기준으로 접근 제어

import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { ROUTES } from './routes';
import { hasFeature, type Feature } from '../domain/tiers';

interface Props {
  children: React.ReactNode;
}

/** 미인증 사용자 → /login 으로 리다이렉트
 *  isInitialized 전에는 null 반환 (초기화 중 로그인 페이지 플래시 방지)
 */
export function RequireAuth({ children }: Props) {
  const isInitialized   = useAppStore((s) => s.isInitialized);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isInitialized) return null; // AppInitializer가 처리하므로 이중 플래시 방지
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

/** 이미 인증된 사용자가 /login 접근 시 → 홈으로 리다이렉트 */
export function RequireNoAuth({ children }: Props) {
  const isInitialized   = useAppStore((s) => s.isInitialized);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  if (!isInitialized) return null;
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

/** 특정 기능(Feature)을 사용할 수 없는 티어 → /upgrade 로 리다이렉트 */
export function RequireFeature({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const userTier = useAppStore((s) => s.userTier);

  if (!hasFeature(userTier, feature)) {
    return <Navigate to={ROUTES.upgrade} replace />;
  }
  return <>{children}</>;
}

/** userTier === 'free'인 사용자가 주 기능에 접근 시 → /upgrade 로 리다이렉트 */
export function RequireActiveTier({ children }: Props) {
  const userTier = useAppStore((s) => s.userTier);

  if (userTier === 'free') {
    return <Navigate to={ROUTES.upgrade} replace />;
  }
  return <>{children}</>;
}
