// AppShellMobile — RESET Budget Mobile Dedicated Layout
// Mobile: Bottom tab bar navigation with Touch-optimized icons + Bottom Sheet AI Coach

import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import {
  IcHome, IcList, IcShield, IcChart, IcCog, IcSparkle
} from '../ui/Icons';
import { CoachPanel } from '../coach/CoachPanel';
import { useAppStore } from '../../app/store/appStore';
import { hasFeature, type Feature } from '../../domain/tiers';
import styles from './AppShellMobile.module.css';

interface NavItem {
  path: string;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  feature?: Feature;
}

const BOTTOM_NAV: NavItem[] = [
  { path: ROUTES.home,         label: '홈',      Icon: IcHome   },
  { path: ROUTES.record,       label: '기록',    Icon: IcList,   feature: 'record' },
  { path: ROUTES.safety,       label: '안전도',  Icon: IcShield, feature: 'safety' },
  { path: ROUTES.statsMonthly, label: '통계',    Icon: IcChart,  feature: 'stats'  },
  { path: ROUTES.settings,     label: '설정',    Icon: IcCog    },
];

function MiniLogo() {
  return (
    <div className={styles.logoWrap}>
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden>
        <circle cx="16" cy="16" r="13" stroke="var(--mint-500)" strokeWidth="2.5"/>
        <path d="M9 16 A7 7 0 0 1 23 16" stroke="var(--gold-500)" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="16" cy="16" r="3" fill="var(--mint-500)"/>
      </svg>
      <span className={styles.logoText}>머니셋</span>
    </div>
  );
}

export function AppShellMobile() {
  const location    = useLocation();
  const navigate    = useNavigate();
  const userTier    = useAppStore((s) => s.userTier);
  const lastSyncedAt  = useAppStore((s) => s.lastSyncedAt);
  const isSyncing   = useAppStore((s) => s.isSyncing);
  const [coachOpen, setCoachOpen] = useState(false);

  function isActive(item: NavItem) {
    return (
      location.pathname === item.path ||
      (item.path === ROUTES.statsMonthly && location.pathname.startsWith('/stats'))
    );
  }

  function isLocked(item: NavItem): boolean {
    if (!item.feature) return false;
    return !hasFeature(userTier, item.feature);
  }

  function handleNav(item: NavItem) {
    if (isLocked(item)) {
      navigate(ROUTES.upgrade, { viewTransition: true });
    } else {
      navigate(item.path, { viewTransition: true });
    }
  }

  const syncLabel = isSyncing
    ? '동기화 중…'
    : lastSyncedAt
    ? `${new Date(lastSyncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : '대기';

  return (
    <div className={styles.shell}>
      {/* ── Mobile Top Header ── */}
      <header className={styles.header}>
        <MiniLogo />
        <div className={styles.headerRight}>
          <div
            className={`${styles.syncPill} ${isSyncing ? styles.syncing : ''}`}
            title="구글 드라이브 동기화 상태"
          >
            <span className={styles.syncDot} />
            <span className={styles.syncText}>{syncLabel}</span>
          </div>
          
          <button
            className={`${styles.coachTrigger} ${coachOpen ? styles.coachActive : ''}`}
            onClick={() => setCoachOpen(true)}
            aria-label="AI 코치 호출"
            type="button"
          >
            <IcSparkle size={18} />
          </button>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <main className={styles.main}>
        <Outlet />
      </main>

      {/* ── Mobile Bottom Tab Bar ── */}
      <nav className={styles.bottomNav} aria-label="하단 네비게이션">
        {BOTTOM_NAV.map((item) => {
          const active = isActive(item);
          const locked = isLocked(item);
          return (
            <button
              key={item.path}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''} ${locked ? styles.navItemLocked : ''}`}
              onClick={() => handleNav(item)}
              aria-current={active ? 'page' : undefined}
              type="button"
            >
              <div className={`${styles.iconWrap} ${active ? styles.bounce : ''}`}>
                <item.Icon size={22} />
                {locked && <span className={styles.navLockBadge}>🔒</span>}
              </div>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── AI Coach Bottom Sheet ── */}
      {coachOpen && (
        <div className={styles.backdrop} onClick={() => setCoachOpen(false)}>
          <div className={styles.bottomSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHeader}>
              <div className={styles.dragHandle} />
              <div className={styles.sheetTitle}>
                <IcSparkle size={14} style={{ color: 'var(--gold-400)' }} />
                <span>AI 코치 리포트</span>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setCoachOpen(false)}
                aria-label="닫기"
                type="button"
              >
                ✕
              </button>
            </div>
            <div className={styles.sheetContent}>
              <CoachPanel onClose={() => setCoachOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
