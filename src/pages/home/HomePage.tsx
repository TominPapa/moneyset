import { useIsMobilePhone } from '../../hooks/useIsMobilePhone';
import { HomePageDesktop } from './HomePageDesktop';
import { HomePageMobile } from './HomePageMobile';

/**
 * HomePage — 접속 디바이스 가로 크기(600px 미만 여부)에 따라
 * 모바일 전용 1열 대시보드(HomePageMobile)와 패드/PC용 3열 반응형 대시보드(HomePageDesktop)를 조건부 렌더링합니다.
 */
export function HomePage() {
  const isMobile = useIsMobilePhone();

  if (isMobile) {
    return <HomePageMobile />;
  }

  return <HomePageDesktop />;
}
