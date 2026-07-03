// Inline SVG hat — renders correctly in all environments including
// distroless/Alpine containers that have no emoji fonts installed.
export function HatLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Brim */}
      <ellipse cx="32" cy="34" rx="30" ry="5" fill="currentColor" />
      {/* Crown */}
      <rect x="14" y="8" width="36" height="26" rx="4" fill="currentColor" />
      {/* Band */}
      <rect x="14" y="26" width="36" height="5" fill="black" opacity="0.25" />
      {/* Top flat */}
      <rect x="14" y="8" width="36" height="4" rx="2" fill="black" opacity="0.1" />
    </svg>
  );
}
