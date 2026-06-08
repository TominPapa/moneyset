import { useIsMobilePhone } from '../../hooks/useIsMobilePhone';
import { SettingsPageDesktop } from './SettingsPageDesktop';
import { SettingsPageMobile } from './SettingsPageMobile';

export function SettingsPage() {
  const isMobile = useIsMobilePhone();

  if (isMobile) {
    return <SettingsPageMobile />;
  }

  return <SettingsPageDesktop />;
}
