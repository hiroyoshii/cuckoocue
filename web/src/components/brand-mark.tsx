export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      height={size}
      viewBox="0 0 48 48"
      width={size}
    >
      <circle cx="24" cy="24" r="19" fill="var(--teal)" />
      <circle cx="24" cy="24" r="14" fill="var(--bg)" />
      <path d="M24 14v11l8 4" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="35" cy="38" r="5" fill="var(--gold)" />
    </svg>
  );
}
