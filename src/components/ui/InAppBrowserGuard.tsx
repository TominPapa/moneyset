// InAppBrowserGuard — 카카오톡 등 인앱 브라우저 차단
// Google OAuth는 인앱 브라우저에서 동작하지 않으므로 외부 브라우저로 유도

import { useState } from 'react';

// ─── 인앱 브라우저 감지 ──────────────────────────────────────────────────────

interface InAppInfo {
  detected: boolean;
  name: string;
}

function detectInAppBrowser(): InAppInfo {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua))  return { detected: true, name: '카카오톡' };
  if (/NAVER\(inapp/i.test(ua)) return { detected: true, name: '네이버 앱' };
  if (/Line\//i.test(ua))     return { detected: true, name: 'LINE' };
  if (/Instagram/i.test(ua))  return { detected: true, name: 'Instagram' };
  if (/FBAN|FB_IAB/i.test(ua)) return { detected: true, name: 'Facebook' };
  if (/Twitter/i.test(ua))    return { detected: true, name: 'Twitter' };
  return { detected: false, name: '' };
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// ─── KakaoTalk 외부 브라우저 열기 시도 ──────────────────────────────────────

function tryOpenExternal(): boolean {
  const url = window.location.href;
  const ua = navigator.userAgent;

  // KakaoTalk iOS: 카카오톡 openExternal 딥링크
  if (/KAKAOTALK/i.test(ua) && isIOS()) {
    window.location.href =
      'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    return true;
  }
  // KakaoTalk Android: intent 스킴으로 Chrome 강제 열기
  if (/KAKAOTALK/i.test(ua) && /android/i.test(ua)) {
    window.location.href =
      `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
    return true;
  }
  return false;
}

async function copyUrlToClipboard(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = window.location.href;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ─── UI ────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: '#111',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 24px',
  gap: 24,
  textAlign: 'center',
};

const iconStyle: React.CSSProperties = {
  fontSize: 56,
  lineHeight: 1,
};

const titleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#fff',
  lineHeight: 1.3,
  margin: 0,
};

const descStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#aaa',
  lineHeight: 1.6,
  margin: 0,
  maxWidth: 320,
};

const stepBoxStyle: React.CSSProperties = {
  background: '#1e1e1e',
  border: '1px solid #333',
  borderRadius: 12,
  padding: '16px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: '100%',
  maxWidth: 320,
  textAlign: 'left',
};

const stepStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  fontSize: 13,
  color: '#ccc',
  lineHeight: 1.5,
};

const stepNumStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: '#10b981',
  color: '#fff',
  fontSize: 11,
  fontWeight: 800,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: 1,
};

const btnPrimary: React.CSSProperties = {
  width: '100%',
  maxWidth: 320,
  padding: '14px 24px',
  background: '#10b981',
  border: 'none',
  borderRadius: 12,
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSecondary: React.CSSProperties = {
  width: '100%',
  maxWidth: 320,
  padding: '12px 24px',
  background: 'transparent',
  border: '1px solid #333',
  borderRadius: 12,
  color: '#aaa',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const copyConfirm: React.CSSProperties = {
  fontSize: 13,
  color: '#10b981',
  fontWeight: 600,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function InAppBrowserGuard({ children }: { children: React.ReactNode }) {
  const info = detectInAppBrowser();
  const [copied, setCopied] = useState(false);

  if (!info.detected) return <>{children}</>;

  const handleOpenExternal = () => {
    const opened = tryOpenExternal();
    if (!opened) {
      // 딥링크 실패 시 URL 복사로 폴백
      handleCopy();
    }
  };

  const handleCopy = async () => {
    await copyUrlToClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div style={overlay}>
      <div style={iconStyle}>🔒</div>

      <p style={titleStyle}>
        {info.name} 브라우저에서는<br />
        Google 로그인이 지원되지 않아요
      </p>

      <p style={descStyle}>
        머니셋은 Google 계정으로 데이터를 안전하게 저장합니다.
        외부 브라우저(Safari 또는 Chrome)에서 열어주세요.
      </p>

      <div style={stepBoxStyle}>
        <div style={stepStyle}>
          <div style={stepNumStyle}>1</div>
          <span>아래 버튼을 눌러 링크를 복사하거나 외부 브라우저로 열기</span>
        </div>
        <div style={stepStyle}>
          <div style={stepNumStyle}>2</div>
          <span>Safari 또는 Chrome을 열고 주소창에 붙여넣기</span>
        </div>
        <div style={stepStyle}>
          <div style={stepNumStyle}>3</div>
          <span>Google 계정으로 로그인하면 데이터가 안전하게 동기화됩니다</span>
        </div>
      </div>

      <button style={btnPrimary} onClick={handleOpenExternal} type="button">
        🌐 외부 브라우저로 열기
      </button>

      <button style={btnSecondary} onClick={handleCopy} type="button">
        {copied ? '✓ 복사됨!' : '🔗 링크 복사하기'}
      </button>

      {copied && <p style={copyConfirm}>클립보드에 복사되었습니다!</p>}
    </div>
  );
}
