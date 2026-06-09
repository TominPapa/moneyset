// SVG Icon set — RESET Budget Design System
// All icons use 20×20 viewBox, stroke-based, currentColor

import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}

function ic(d: string, extra?: React.ReactNode) {
  return function Icon({ size = 20, strokeWidth = 1.6, className, style }: IconProps) {
    return (
      <svg
        width={size} height={size} viewBox="0 0 20 20"
        fill="none" stroke="currentColor"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
        className={className} style={style} aria-hidden
      >
        <path d={d} />
        {extra}
      </svg>
    );
  };
}

// ── Navigation ──────────────────────────────────────────────────────────────
export const IcHome    = ic('M3 9.5 10 3l7 6.5V16a1.5 1.5 0 0 1-1.5 1.5h-3V12h-5v5.5h-3A1.5 1.5 0 0 1 3 16V9.5Z');
export const IcList    = ic('M6 5h11M6 10h11M6 15h11', <>
  <circle cx="3.3" cy="5" r="0.9" fill="currentColor" stroke="none"/>
  <circle cx="3.3" cy="10" r="0.9" fill="currentColor" stroke="none"/>
  <circle cx="3.3" cy="15" r="0.9" fill="currentColor" stroke="none"/>
</>);
export const IcBudget  = ic('M10 3v14M5 8h7.5a2.5 2.5 0 0 1 0 5H5m0 0h8');
export const IcRepeat  = ic('M4 8.5 6 6.5 8 8.5M16 11.5l-2 2-2-2M6.5 6.5H13a3 3 0 0 1 3 3v.5M13.5 13.5H7a3 3 0 0 1-3-3V10');
export const IcShield  = ic('M10 3 4 5.5v5c0 3.3 2.4 6.1 6 7 3.6-.9 6-3.7 6-7v-5L10 3Z', <path d="m7.5 10 1.7 1.8L13 8.5"/>);
export const IcChart   = ic('M3 17h14M6 13v-3M10 13V7M14 13v-5');
export const IcUsers   = ic('M3 16.5c.4-2.4 2.4-3.5 4.5-3.5s4.1 1.1 4.5 3.5M13 13c1.8 0 3.3 1 3.7 3M7.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z');
export const IcCog     = ic('M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z', <path d="m10 2 .7 1.8 1.9-.2.5 1.8 1.8.7-.2 1.9L16.5 9l-1.8 1L15 11.8l-1.8.7-.5 1.8-1.9-.2L10 16l-1.1-1.9-1.9.2-.5-1.8L4.7 12l.2-1.9L3.5 9l1.4-1-.2-1.9 1.8-.7.5-1.8 1.9.2L10 2Z"/>);

// ── Actions / misc ──────────────────────────────────────────────────────────
export const IcPlus         = ic('M10 4v12M4 10h12');
export const IcMinus        = ic('M4 10h12');
export const IcArrowRight   = ic('M4 10h12m-4-4 4 4-4 4');
export const IcArrowLeft    = ic('M16 10H4m4-4-4 4 4 4');
export const IcChevronDown  = ic('M5 8l5 5 5-5');
export const IcChevronRight = ic('M7.5 4.5 13 10l-5.5 5.5');
export const IcChevronLeft  = ic('M12.5 4.5 7 10l5.5 5.5');
export const IcSearch       = ic('M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm4.5-1.5L17 17');
export const IcCalendar     = ic('M4 7h12M6 3v2m8-2v2M5.5 7h9A1.5 1.5 0 0 1 16 8.5v7A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-7A1.5 1.5 0 0 1 5.5 7Z');
export const IcBell         = ic('M6 13V9.5a4 4 0 1 1 8 0V13l1.5 1.5h-11L6 13Zm2 2a2 2 0 0 0 4 0');
export const IcFilter       = ic('M3 5h14m-3 5h-8m5 5h-2');
export const IcSparkle      = ic('M10 3v5m0 4v5M3 10h5m4 0h5M5 5l2 2m6 6 2 2m0-12-2 2m-6 6-2 2');
export const IcDownload     = ic('M10 3v9m-4-4 4 4 4-4M4 16h12');
export const IcCheck        = ic('M4 10.5 8 14.5 16 6');
export const IcClose        = ic('M5 5l10 10M15 5 5 15');
export const IcFlame        = ic('M10 3c.5 3 3 4 3 7a3 3 0 1 1-6 0c0-1.8 1-2.5 1-4 1 .5 2 1.2 2-3Z');
export const IcFlag         = ic('M4 17V3m0 1h8l-1.5 3.5L12 11H4');
export const IcInfo         = ic('M10 13.5v-4M10 6.5h.01M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z');
export const IcTrending     = ic('M3 14 8 9l3 3 6-6M13 7h4v4');
export const IcWallet       = ic('M4 6.5A1.5 1.5 0 0 1 5.5 5h10A1.5 1.5 0 0 1 17 6.5v8A1.5 1.5 0 0 1 15.5 16h-10A1.5 1.5 0 0 1 4 14.5v-8Z', <><path d="M14 11h1"/><path d="M4 8h13"/></>);
export const IcMoon         = ic('M15.5 12.5A6 6 0 0 1 7.5 4.5 6 6 0 1 0 15.5 12.5Z');
export const IcSun          = ic('M10 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', <path d="M10 2v2m0 12v2M2 10h2m12 0h2M4 4l1.5 1.5M14.5 14.5 16 16M4 16l1.5-1.5M14.5 5.5 16 4"/>);
export const IcDots         = ic('M6 10.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z');

// ── Category icons ──────────────────────────────────────────────────────────
export const IcFood       = ic('M6 3v6a2 2 0 0 0 4 0V3M8 9v8M14 3c-1.5 0-2.5 2-2.5 4s.5 3 1.5 3v7h2V3Z');
export const IcHouse      = ic('M3 10 10 4l7 6v6.5a.5.5 0 0 1-.5.5H13v-5H7v5H3.5a.5.5 0 0 1-.5-.5V10Z');
export const IcShop       = ic('M4 8h12l-.5 8h-11L4 8Zm2 0a4 4 0 1 1 8 0');
export const IcCoffee     = ic('M4 7h10v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7Zm10 1h2a2 2 0 1 1 0 4h-2M4 4c.5-1 1.5-1 2 0s1.5 1 2 0');
export const IcCar        = ic('M3 13v-3l1.5-4h11L17 10v3m-3 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-7 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z');
export const IcMedia      = ic('M4 5h12v10H4z', <path d="M8.5 8 12 10l-3.5 2Z"/>);
export const IcHealth     = ic('M10 16s-6-3.5-6-8a3.5 3.5 0 0 1 6-2.5A3.5 3.5 0 0 1 16 8c0 4.5-6 8-6 8Z');
export const IcBook       = ic('M4 4h5a2 2 0 0 1 2 2v11a2 2 0 0 0-2-2H4V4Zm12 0h-5a2 2 0 0 0-2 2v11a2 2 0 0 1 2-2h5V4Z');
export const IcPhone      = ic('M7 4h6a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2.5 11h1');
export const IcCreditCard = ic('M3 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 2h14M6 13h2');
export const IcBolt       = ic('M10 3 4 12h5l-1 5 6-9h-5l1-5Z');
export const IcGift       = ic('M3 8h14v3H3V8Zm1 3h12v6H4v-6Zm6-3V5.5a2 2 0 1 0-2 2h4a2 2 0 1 0-2-2V8Zm0 0v9');
export const IcMore       = ic('M10 4v12', <path d="M4 10h12"/>);
export const IcMart       = ic('M4 8h12l-.5 8h-11L4 8Zm2 0a4 4 0 1 1 8 0');
export const IcLeisure    = ic('M4 5h12v10H4z', <path d="M8.5 8 12 10l-3.5 2Z"/>);
export const IcLoan       = ic('M3 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 2h14M6 13h2');
export const IcUtil       = ic('M10 3 4 12h5l-1 5 6-9h-5l1-5Z');
export const IcIncome     = ic('M3 14 8 9l3 3 6-6M13 7h4v4');
