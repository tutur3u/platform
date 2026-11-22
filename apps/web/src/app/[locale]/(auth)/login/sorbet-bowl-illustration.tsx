import { cn } from '@tuturuuu/utils/format';
import './auth-stage.css';

/**
 * The "sorbet bowl": three scoops (a calendar, a check and a smiling scoop)
 * in a bowl, with a few sparkles. Original vector art drawn from token roles
 * only; decorative, so it is hidden from assistive technology.
 */
export function SorbetBowlIllustration({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('block h-auto', className)}
      focusable="false"
      viewBox="0 0 320 280"
    >
      <circle className="auth-il-pink-calm" cx="160" cy="146" r="124" />
      <g className="auth-float">
        <circle
          className="auth-il-blue auth-il-line"
          cx="112"
          cy="150"
          r="42"
          strokeWidth="3"
        />
        <circle
          className="auth-il-green auth-il-line"
          cx="208"
          cy="150"
          r="42"
          strokeWidth="3"
        />
        <circle
          className="auth-il-yellow auth-il-line"
          cx="160"
          cy="114"
          r="46"
          strokeWidth="3"
        />
        <rect
          className="auth-il-surface auth-il-ink"
          height="28"
          rx="6"
          strokeWidth="2.5"
          width="34"
          x="93"
          y="130"
        />
        <path
          className="auth-il-none auth-il-ink"
          d="M93 139H127"
          strokeWidth="2.5"
        />
        <circle className="auth-il-fg" cx="102" cy="148" r="2.4" />
        <circle className="auth-il-fg" cx="110" cy="148" r="2.4" />
        <circle className="auth-il-blue-ink" cx="118" cy="148" r="2.4" />
        <path
          className="auth-il-none auth-il-green-stroke auth-il-round"
          d="M194 146l9 9 17-19"
          strokeWidth="5"
        />
        <circle className="auth-il-fg" cx="148" cy="108" r="3.6" />
        <circle className="auth-il-fg" cx="172" cy="108" r="3.6" />
        <path
          className="auth-il-none auth-il-ink auth-il-round"
          d="M150 121q10 8 20 0"
          strokeWidth="3"
        />
        <circle className="auth-il-pink" cx="139" cy="119" r="5" />
        <circle className="auth-il-pink" cx="181" cy="119" r="5" />
      </g>
      <path
        className="auth-il-surface auth-il-line"
        d="M64 166H256C256 222 214 252 160 252C106 252 64 222 64 166Z"
        strokeWidth="3"
      />
      <path
        className="auth-il-none auth-il-detail auth-il-round"
        d="M80 196H240"
        strokeWidth="3"
      />
      <rect
        className="auth-il-surface auth-il-line"
        height="12"
        rx="6"
        strokeWidth="3"
        width="64"
        x="128"
        y="250"
      />
      <path
        className="auth-il-fg auth-twinkle"
        d="M0-9L2.3-2.3L9 0L2.3 2.3L0 9L-2.3 2.3L-9 0L-2.3-2.3Z"
        transform="translate(50 62)"
      />
      <path
        className="auth-il-fg"
        d="M0-6L1.5-1.5L6 0L1.5 1.5L0 6L-1.5 1.5L-6 0L-1.5-1.5Z"
        transform="translate(272 80)"
      />
      <circle className="auth-il-gray" cx="278" cy="214" r="4" />
    </svg>
  );
}
