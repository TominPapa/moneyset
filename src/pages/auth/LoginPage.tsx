// LoginPage — RESET Budget
// Google OAuth 2.0 로그인 (implicit flow, access_token 직접 수신)

import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAppStore } from '../../app/store/appStore';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const login = useAppStore((s) => s.login);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = useGoogleLogin({
    flow: 'implicit',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.appdata',
    ].join(' '),
    onSuccess: async (tokenResponse) => {
      setIsLoading(true);
      setError(null);
      try {
        await login(tokenResponse.access_token);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Google Drive 연결 중 오류가 발생했습니다. 다시 시도해주세요.'
        );
        setIsLoading(false);
      }
    },
    onError: () => {
      setError('Google 로그인이 취소되었거나 실패했습니다. 다시 시도해주세요.');
    },
  });

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>💰</span>
          <h1 className={styles.appName}>머니셋</h1>
          <p className={styles.tagline}>지출을 분석하고 재무 안전도를 관리하세요</p>
        </div>

        <div className={styles.body}>
          {error && (
            <p className={styles.errorMsg} role="alert">
              {error}
            </p>
          )}

          <button
            className={styles.googleBtn}
            onClick={() => handleGoogleLogin()}
            disabled={isLoading}
            type="button"
          >
            {isLoading ? (
              <span className={styles.loadingText}>연결 중…</span>
            ) : (
              <>
                <GoogleIcon />
                <span>Google 계정으로 시작하기</span>
              </>
            )}
          </button>

          <p className={styles.notice}>
            데이터는 본인의 Google Drive에만 저장됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
