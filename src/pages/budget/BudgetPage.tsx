// BudgetPage Wrapper — 데스크톱/모바일 분기 컴포넌트

import { useIsMobilePhone } from '../../hooks/useIsMobilePhone';
import { BudgetPageDesktop } from './BudgetPageDesktop';
import { BudgetPageMobile } from './BudgetPageMobile';

export function BudgetPage() {
  const isMobile = useIsMobilePhone();

  if (isMobile) {
    return <BudgetPageMobile />;
  }

  return <BudgetPageDesktop />;
}
