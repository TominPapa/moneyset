// AppShell — RESET Budget Design System V2
// Desktop: 232px sidebar with SVG icons + AI Coach section
// Mobile:  bottom tab bar (5 items)

import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import {
  IcHome, IcList, IcBudget, IcRepeat, IcShield, IcChart,
  IcUsers, IcCog, IcSparkle,
} from '../ui/Icons';
import { CoachPanel } from '../coach/CoachPanel';
import styles from './AppShell.module.css';

interface NavItem {
  path: string;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
}

const SIDEBAR_NAV: NavItem[] = [
  { path: ROUTES.home,         label: '홈',       Icon: IcHome   },
  { path: ROUTES.record,       label: '기록',     Icon: IcList   },
  { path: ROUTES.budget,       label: '예산',     Icon: IcBudget },
  { path: ROUTES.recurring,    label: '정기지출', Icon: IcRepeat },
  { path: ROUTES.safety,       label: '안전도',   Icon: IcShield },
  { path: ROUTES.statsMonthly, label: '통계',     Icon: IcChart  },
  { path: ROUTES.settlement,   label: '공동정산', Icon: IcUsers  },
  { path: ROUTES.settings,     label: '설정',     Icon: IcCog    },
];

const BOTTOM_NAV: NavItem[] = [
  { path: ROUTES.home,         label: '홈',      Icon: IcHome   },
  { path: ROUTES.record,       label: '기록',    Icon: IcList   },
  { path: ROUTES.safety,       label: '안전도',  Icon: IcShield },
  { path: ROUTES.statsMonthly, label: '통계',    Icon: IcChart  },
  { path: ROUTES.settings,     label: '설정',    Icon: IcCog    },
];

// LogoMark SVG
function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" stroke="var(--mint-500)" strokeWidth="2"/>
      <path d="M9 16 A7 7 0 0 1 23 16" stroke="var(--gold-500)" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="16" cy="16" r="3" fill="var(--mint-500)"/>
    </svg>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [coachOpen, setCoachOpen] = useState(false);

  function isActive(item: NavItem) {
    return (
      location.pathname === item.path ||
      (item.path === ROUTES.statsMonthly && location.pathname.startsWith('/stats'))
    );
  }

  return (
    <div className={styles.shell}>

      {/* ── Sidebar (desktop) ── */}
      <aside className={styles.sidebar}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <LogoMark size={28} />
          <div className={styles.logoText}>
            <div className={styles.logoName}>머니셋</div>
            <div className={styles.logoSub}>MoneySET · V2.0</div>
          </div>
        </div>

        {/* Nav items */}
        <nav className={styles.sidebarNav} aria-label="메인 네비게이션">
          {SIDEBAR_NAV.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.path}
                className={`${styles.sidebarItem} ${active ? styles.sidebarItemActive : ''}`}
                onClick={() => navigate(item.path, { viewTransition: true })}
                aria-current={active ? 'page' : undefined}
                type="button"
              >
                {active && <span className={styles.activeBar} />}
                <item.Icon size={18} />
                <span className={styles.sidebarLabel}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* AI Coach section */}
        <div className={styles.aiCoach}>
          <div className={styles.aiCoachLabel}>AI 코치</div>
          {!coachOpen && (
            <>
              <div className={styles.aiCoachText}>
                이번 달 지출 패턴을 분석해서{' '}
                <span className={styles.aiCoachHighlight}>맞춤 재무 팁</span>을 알려드려요.
              </div>
              <button
                className={styles.aiCoachBtn}
                type="button"
                onClick={() => setCoachOpen(true)}
              >
                <IcSparkle size={13} />
                팁 보기
              </button>
            </>
          )}
          {coachOpen && (
            <CoachPanel onClose={() => setCoachOpen(false)} />
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={styles.main}>
        <Outlet />
      </main>

      {/* ── Bottom tab bar (mobile) ── */}
      <nav className={styles.bottomNav} aria-label="메인 네비게이션">
        {BOTTOM_NAV.map((item) => {
          const active = isActive(item);
          return (
            <button
              key={item.path}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              onClick={() => navigate(item.path, { viewTransition: true })}
              aria-current={active ? 'page' : undefined}
              type="button"
            >
              <item.Icon size={20} />
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>

    </div>
  );
}
