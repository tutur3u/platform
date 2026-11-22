import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import './onboarding-illustrations.css';

/**
 * Original vector scenes for the welcome flow, drawn from token roles only
 * (see the stylesheet) and hidden from assistive technology.
 */
type SceneProps = { className?: string };

function Scene({ children, className }: SceneProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('block h-auto shrink-0', className)}
      focusable="false"
      viewBox="0 0 200 160"
    >
      {children}
    </svg>
  );
}

/** A profile card with a pencil. */
export function ProfileScene({ className }: SceneProps) {
  return (
    <Scene className={className}>
      <circle cx="100" cy="82" r="66" className="ob-il-yellow-c" />
      <rect
        x="42"
        y="44"
        width="112"
        height="76"
        rx="14"
        className="ob-il-surface ob-il-line"
        strokeWidth="3"
      />
      <circle
        cx="74"
        cy="78"
        r="17"
        className="ob-il-yellow ob-il-line"
        strokeWidth="3"
      />
      <circle cx="68" cy="75" r="2.5" className="ob-il-fg" />
      <circle cx="80" cy="75" r="2.5" className="ob-il-fg" />
      <path
        d="M69 84q5 4 10 0"
        className="ob-il-none ob-il-ink ob-il-round"
        strokeWidth="2.5"
      />
      <path
        d="M102 70h36M102 84h22"
        className="ob-il-none ob-il-detail ob-il-round"
        strokeWidth="4"
      />
      <path
        d="M128 124l28-28 9 9-28 28h-9z"
        className="ob-il-pink ob-il-line ob-il-round"
        strokeWidth="3"
      />
    </Scene>
  );
}

/** A workspace of stacked blocks under a flag. */
export function SpaceScene({ className }: SceneProps) {
  return (
    <Scene className={className}>
      <circle cx="100" cy="82" r="66" className="ob-il-blue-c" />
      <path
        d="M100 38V18"
        className="ob-il-none ob-il-ink ob-il-round"
        strokeWidth="3"
      />
      <path
        d="M100 18h20l-6 7 6 7h-20z"
        className="ob-il-orange ob-il-line ob-il-round"
        strokeWidth="2.5"
      />
      <rect
        x="80"
        y="38"
        width="40"
        height="40"
        rx="10"
        className="ob-il-pink ob-il-line"
        strokeWidth="3"
      />
      <rect
        x="58"
        y="80"
        width="40"
        height="40"
        rx="10"
        className="ob-il-green ob-il-line"
        strokeWidth="3"
      />
      <rect
        x="102"
        y="80"
        width="40"
        height="40"
        rx="10"
        className="ob-il-yellow ob-il-line"
        strokeWidth="3"
      />
      <path
        d="M40 126h120"
        className="ob-il-none ob-il-detail ob-il-round"
        strokeWidth="4"
      />
    </Scene>
  );
}

/** Four interest bubbles. */
export function InterestsScene({ className }: SceneProps) {
  return (
    <Scene className={className}>
      <circle cx="100" cy="82" r="66" className="ob-il-pink-c" />
      <circle
        cx="76"
        cy="58"
        r="20"
        className="ob-il-blue ob-il-line"
        strokeWidth="3"
      />
      <circle
        cx="124"
        cy="58"
        r="20"
        className="ob-il-green ob-il-line"
        strokeWidth="3"
      />
      <circle
        cx="76"
        cy="106"
        r="20"
        className="ob-il-orange ob-il-line"
        strokeWidth="3"
      />
      <circle
        cx="124"
        cy="106"
        r="20"
        className="ob-il-purple ob-il-line"
        strokeWidth="3"
      />
      <path
        d="M117 58l5 5 9-10"
        className="ob-il-none ob-st-green ob-il-round"
        strokeWidth="3"
      />
      <rect
        x="67"
        y="50"
        width="18"
        height="16"
        rx="4"
        className="ob-il-surface"
      />
      <path
        d="M69 106h14M76 99v14"
        className="ob-il-none ob-st-orange ob-il-round"
        strokeWidth="3"
      />
      <circle cx="124" cy="106" r="6" className="ob-il-surface" />
    </Scene>
  );
}

/** A sorbet bowl with sparkles. */
export function DoneScene({ className }: SceneProps) {
  return (
    <Scene className={className}>
      <circle cx="100" cy="82" r="66" className="ob-il-green-c" />
      <circle
        cx="84"
        cy="82"
        r="22"
        className="ob-il-blue ob-il-line"
        strokeWidth="3"
      />
      <circle
        cx="116"
        cy="82"
        r="22"
        className="ob-il-pink ob-il-line"
        strokeWidth="3"
      />
      <circle
        cx="100"
        cy="64"
        r="24"
        className="ob-il-yellow ob-il-line"
        strokeWidth="3"
      />
      <path
        d="M100 40c2-8 8-12 14-12"
        className="ob-il-none ob-il-ink ob-il-round"
        strokeWidth="3"
      />
      <circle
        cx="100"
        cy="38"
        r="7"
        className="ob-il-red ob-il-line"
        strokeWidth="2.5"
      />
      <path
        d="M56 92H144C144 120 126 134 100 134C74 134 56 120 56 92Z"
        className="ob-il-surface ob-il-line"
        strokeWidth="3"
      />
      <rect
        x="40"
        y="40"
        width="8"
        height="8"
        rx="2"
        transform="rotate(20 44 44)"
        className="ob-il-orange ob-twinkle"
      />
      <rect
        x="152"
        y="50"
        width="8"
        height="8"
        rx="2"
        transform="rotate(-15 156 54)"
        className="ob-il-purple ob-twinkle"
      />
      <circle cx="160" cy="112" r="4" className="ob-il-blue-i" />
      <circle cx="34" cy="104" r="3" className="ob-il-pink-i" />
    </Scene>
  );
}
