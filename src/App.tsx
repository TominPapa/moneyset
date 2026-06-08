// App — RESET Budget
import { useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from './design/ThemeProvider';
import { AppRouter } from './app/Router';
import { useAppStore } from './app/store/appStore';
import { InAppBrowserGuard } from './components/ui/InAppBrowserGuard';
import { hasPendingSync } from './storage/localPlanStore';
import './design/global.css';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID 환경변수가 정의되지 않았습니다. .env 파일을 확인하세요.');

function AppInitializer({ children }: { children: React.ReactNode }) {
  const isInitialized = useAppStore((s) => s.isInitialized);
  const initApp = useAppStore((s) => s.initApp);

  useEffect(() => {
    initApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingSync()) {
        e.preventDefault();
        e.returnValue = '구글 드라이브 동기화가 진행 중입니다. 페이지를 종료하면 일부 데이터가 저장되지 않을 수 있습니다.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  if (!isInitialized) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-primary)',
          color: 'var(--color-text-secondary)',
          fontSize: '0.875rem',
        }}
      >
        로딩 중…
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const themeMode = useAppStore((s) => s.config.themeMode);

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <ThemeProvider mode={themeMode}>
        <InAppBrowserGuard>
          <AppInitializer>
            <AppRouter />
          </AppInitializer>
        </InAppBrowserGuard>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}
