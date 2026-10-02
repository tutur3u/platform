import type { CreativeSpace } from './spaces';

export function SpaceArtwork({ space }: { space: CreativeSpace }) {
  return (
    <svg
      aria-hidden="true"
      className="space-header-illustration"
      viewBox="0 0 280 240"
      fill="none"
    >
      {space === 'art' ? (
        <>
          <circle cx="160" cy="105" r="72" />
          <rect
            x="45"
            y="65"
            width="140"
            height="140"
            transform="rotate(-12 45 65)"
          />
          <path d="m25 200 165-160M95 200 165 60M35 135h205" />
        </>
      ) : space === 'story' ? (
        <>
          <path d="M140 55c-40-30-85-20-110-10v145c30-15 70-15 110 5 40-20 80-20 110-5V45c-25-10-70-20-110 10Zm0 0v140" />
          <path d="m50 75 60 5m-60 20 60 5m-60 20 60 5m60-50 50-5m-50 30 50-5m-50 30 50-5" />
          <circle cx="225" cy="35" r="22" />
        </>
      ) : (
        <>
          <ellipse
            cx="140"
            cy="125"
            rx="110"
            ry="65"
            transform="rotate(-20 140 125)"
          />
          <ellipse
            cx="140"
            cy="125"
            rx="65"
            ry="100"
            transform="rotate(30 140 125)"
          />
          <path d="m45 180 65-100 40 55 55-105 40 150" />
          <circle cx="110" cy="80" r="7" />
          <circle cx="205" cy="30" r="7" />
        </>
      )}
    </svg>
  );
}
