// RecordPage Wrapper — 데스크톱/모바일 분기 컴포넌트

import { useIsMobilePhone } from '../../hooks/useIsMobilePhone';
import { RecordPageDesktop } from './RecordPageDesktop';
import { RecordPageMobile } from './RecordPageMobile';

export function RecordPage() {
  const isMobile = useIsMobilePhone();

  if (isMobile) {
    return <RecordPageMobile />;
  }

  return <RecordPageDesktop />;
}
