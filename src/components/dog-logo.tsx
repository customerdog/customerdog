/**
 * customerdog brand mark. Inline SVG so it scales without raster
 * artifacts and the brand color follows config.brand_color via the
 * `accent` prop (defaults to the same red used in the favicon).
 *
 * Two render modes:
 *   - <DogLogo size={20} />              — small inline mark (chat header)
 *   - <DogLogo size={40} bg={false} />   — face only, no rounded
 *                                          background (use on a colored
 *                                          surface; e.g. the empty-state
 *                                          hero where the page already
 *                                          has the brand color).
 */
export function DogLogo({
  size = 24,
  accent = '#dc2626',
  bg = true,
  className,
  title = 'customerdog',
}: {
  size?: number;
  accent?: string;
  bg?: boolean;
  className?: string;
  title?: string;
}) {
  const faceColor = bg ? '#ffffff' : accent;
  const snoutColor = bg ? '#fde2e2' : '#fde2e2';
  const inkColor = '#1f1f1f';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      {bg ? <rect width="100" height="100" rx="22" fill={accent} /> : null}

      {/* Floppy ears */}
      <path
        d="M 22 30 C 16 30, 14 42, 20 54 C 24 60, 30 60, 32 52 L 32 36 Z"
        fill={faceColor}
      />
      <path
        d="M 78 30 C 84 30, 86 42, 80 54 C 76 60, 70 60, 68 52 L 68 36 Z"
        fill={faceColor}
      />

      {/* Head */}
      <ellipse cx="50" cy="58" rx="24" ry="22" fill={faceColor} />

      {/* Eyes */}
      <circle cx="41" cy="54" r="4" fill={inkColor} />
      <circle cx="59" cy="54" r="4" fill={inkColor} />

      {/* Snout */}
      <ellipse cx="50" cy="68" rx="11" ry="8" fill={snoutColor} />

      {/* Nose */}
      <ellipse cx="50" cy="64" rx="4" ry="3" fill={inkColor} />

      {/* Smile */}
      <path
        d="M 44 71 Q 50 76, 56 71"
        stroke={inkColor}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
