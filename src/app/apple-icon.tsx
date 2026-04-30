import { ImageResponse } from 'next/og';

/**
 * Apple touch icon — Next.js requires PNG/JPEG for `apple-icon.*`,
 * not SVG. Generate one at build time from the same dog mark we use
 * in icon.svg, via Satori's SVG-rendering subset.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          // iOS clips to a rounded mask itself, so leave the background
          // square here to avoid double-rounding.
          background: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width={180}
          height={180}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Floppy ears */}
          <path
            d="M 22 30 C 16 30, 14 42, 20 54 C 24 60, 30 60, 32 52 L 32 36 Z"
            fill="#ffffff"
          />
          <path
            d="M 78 30 C 84 30, 86 42, 80 54 C 76 60, 70 60, 68 52 L 68 36 Z"
            fill="#ffffff"
          />
          {/* Head */}
          <ellipse cx="50" cy="58" rx="24" ry="22" fill="#ffffff" />
          {/* Eyes */}
          <circle cx="41" cy="54" r="4" fill="#1f1f1f" />
          <circle cx="59" cy="54" r="4" fill="#1f1f1f" />
          {/* Snout */}
          <ellipse cx="50" cy="68" rx="11" ry="8" fill="#fde2e2" />
          {/* Nose */}
          <ellipse cx="50" cy="64" rx="4" ry="3" fill="#1f1f1f" />
          {/* Smile */}
          <path
            d="M 44 71 Q 50 76, 56 71"
            stroke="#1f1f1f"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}
