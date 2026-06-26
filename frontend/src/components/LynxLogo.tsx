export function LynxLogo({ size = 32, className = '' }: { size?: number, className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <mask id="lynxMask">
          {/* The Chat Bubble + Lynx shape */}
          <g fill="white" stroke="white" strokeWidth="10" strokeLinejoin="round">
            <rect x="16" y="28" width="68" height="48" rx="16" />
            {/* Left Ear */}
            <polygon points="16,45 18,6 38,28" />
            {/* Right Ear */}
            <polygon points="84,45 82,6 62,28" />
            {/* Chat Tail */}
            <polygon points="22,65 10,94 45,76" />
          </g>
          
          {/* The friendly cutouts */}
          <circle cx="34" cy="48" r="6.5" fill="black" />
          <circle cx="66" cy="48" r="6.5" fill="black" />
          <path d="M 43 60 Q 50 68 57 60" fill="none" stroke="black" strokeWidth="5" strokeLinecap="round" />
        </mask>
      </defs>

      {/* Uses currentColor so it can be styled easily via CSS */}
      <rect width="100" height="100" fill="currentColor" mask="url(#lynxMask)" />
    </svg>
  );
}
