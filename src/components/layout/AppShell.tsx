import { useIsMobilePhone } from '../../hooks/useIsMobilePhone';
import { AppShellDesktop } from './AppShellDesktop';
import { AppShellMobile } from './AppShellMobile';

/**
 * AppShell — 접속 디바이스 가로 크기(600px 미만 여부)에 따라
 * 모바일 전용 UI(AppShellMobile)와 패드/PC용 반응형 UI(AppShellDesktop)를 조건부 렌더링합니다.
 */
export function AppShell() {
  const isMobile = useIsMobilePhone();

  if (isMobile) {
    return <AppShellMobile />;
  }

  return <AppShellDesktop />;
}
