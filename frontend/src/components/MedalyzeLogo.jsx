import React from "react";

export function MedalyzeLogo({ size = 40, showText = true, textClass = "text-medalyze-dark", mark = "auto" }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="medalyze-logo">
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Medalyze">
        <circle cx="32" cy="32" r="27" stroke="#065F46" strokeWidth="2" opacity="0.35" />
        <circle cx="32" cy="32" r="20" stroke="#84CC16" strokeWidth="1.5" opacity="0.4" />
        {/* cross */}
        <rect x="14" y="27" width="16" height="10" rx="1.5" fill="#065F46" />
        <rect x="17" y="20" width="10" height="24" rx="1.5" fill="#065F46" />
        {/* heartbeat */}
        <path d="M28 36 L33 36 L36 24 L40 44 L44 32 L52 32" stroke="#84CC16" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* arrow */}
        <path d="M46 34 L46 20 M46 20 L42 25 M46 20 L50 25" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showText && (
        <div className="leading-none">
          <div className={`font-head font-extrabold tracking-tight ${textClass}`} style={{ fontSize: size * 0.42 }}>
            MEDALYZE
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-70" style={{ color: "inherit" }}>
            Medtech LLP
          </div>
        </div>
      )}
    </div>
  );
}
