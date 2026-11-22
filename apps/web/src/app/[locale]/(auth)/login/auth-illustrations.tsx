import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import './auth-stage.css';
import './auth-illustrations.css';

/**
 * Spot illustrations for the auth states: original vector art drawn from
 * token roles only, decorative and hidden from assistive technology. The
 * sparkle twinkles only when motion is allowed (auth-stage.css).
 */
function Spot({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn('mx-auto block h-[120px] w-[150px] shrink-0', className)}
      data-testid={testId}
      focusable="false"
      viewBox="0 0 200 160"
    >
      {children}
    </svg>
  );
}

const LINE = 'auth-il-line';
const ROUND = 'auth-il-none auth-il-round';

/** An envelope with a code card rising from it. */
export function EmailCodeIllustration() {
  return (
    <Spot testId="auth-illustration-email">
      <circle className="auth-il-calm-blue" cx="100" cy="82" r="66" />
      <rect
        className={`auth-il-surface ${LINE}`}
        height="46"
        rx="8"
        strokeWidth="3"
        width="64"
        x="68"
        y="28"
      />
      <circle className="auth-il-blue-ink" cx="86" cy="50" r="4" />
      <circle className="auth-il-blue-ink" cx="100" cy="50" r="4" />
      <circle className="auth-il-blue-ink" cx="114" cy="50" r="4" />
      <rect
        className={`auth-il-surface ${LINE}`}
        height="66"
        rx="12"
        strokeWidth="3"
        width="100"
        x="50"
        y="62"
      />
      <path
        className={`${ROUND} ${LINE}`}
        d="M54 68l46 32 46-32"
        strokeWidth="3"
      />
      <path
        className="auth-il-fg auth-twinkle"
        d="M0-8L2-2L8 0L2 2L0 8L-2 2L-8 0L-2-2Z"
        transform="translate(40 34)"
      />
    </Spot>
  );
}

/** A phone beside a shield with a check: two-step verification. */
export function TwoStepIllustration() {
  return (
    <Spot testId="auth-illustration-two-step">
      <circle className="auth-il-calm-green" cx="100" cy="82" r="66" />
      <rect
        className={`auth-il-surface ${LINE}`}
        height="106"
        rx="12"
        strokeWidth="3"
        width="56"
        x="58"
        y="24"
      />
      <path
        className={`${ROUND} auth-il-detail`}
        d="M76 34h20"
        strokeWidth="3"
      />
      <rect
        className="auth-il-calm-green"
        height="14"
        rx="5"
        width="36"
        x="68"
        y="54"
      />
      <path
        className={`${ROUND} auth-il-detail`}
        d="M74 90h24M74 102h16"
        strokeWidth="4"
      />
      <path
        className={`auth-il-green ${LINE} auth-il-round`}
        d="M136 62l26 10v20c0 18-12 28-26 34-14-6-26-16-26-34V72z"
        strokeWidth="3"
      />
      <path
        className={`${ROUND} auth-il-green-stroke`}
        d="M125 94l8 8 14-15"
        strokeWidth="4"
      />
    </Spot>
  );
}

/** Two cards joined by a checked link: sharing an account with an app. */
export function ConsentIllustration() {
  return (
    <Spot testId="auth-illustration-consent">
      <circle className="auth-il-calm-cyan" cx="100" cy="82" r="66" />
      <rect
        className={`auth-il-surface ${LINE}`}
        height="50"
        rx="14"
        strokeWidth="3"
        width="50"
        x="30"
        y="56"
      />
      <path
        className={`${ROUND} auth-il-detail`}
        d="M44 72h22M44 82h14M44 92h18"
        strokeWidth="4"
      />
      <rect
        className={`auth-il-yellow ${LINE}`}
        height="50"
        rx="14"
        strokeWidth="3"
        width="50"
        x="120"
        y="56"
      />
      <circle className="auth-il-surface" cx="145" cy="81" r="9" />
      <path
        className={`${ROUND} ${LINE} auth-il-dash`}
        d="M82 81h36"
        strokeWidth="4"
      />
      <circle
        className={`auth-il-green ${LINE}`}
        cx="100"
        cy="81"
        r="12"
        strokeWidth="3"
      />
      <path
        className={`${ROUND} auth-il-green-stroke`}
        d="M95 81l4 4 7-8"
        strokeWidth="3"
      />
    </Spot>
  );
}

/** A key beside a fingerprint: confirm it is you. */
export function ConfirmIdentityIllustration() {
  return (
    <Spot testId="auth-illustration-confirm">
      <circle className="auth-il-calm-purple" cx="100" cy="82" r="66" />
      <path
        className={`auth-il-surface ${LINE} auth-il-round`}
        d="M106 76h62v12h-10v12h-12v-12h-40z"
        strokeWidth="3"
      />
      <circle
        className={`auth-il-purple ${LINE}`}
        cx="78"
        cy="82"
        r="30"
        strokeWidth="3"
      />
      <path
        className={`${ROUND} auth-il-purple-stroke`}
        d="M64 84c0-9 6-15 14-15s14 6 14 15"
        strokeWidth="3"
      />
      <path
        className={`${ROUND} auth-il-purple-stroke`}
        d="M71 92c0-7 3-11 7-11s7 4 7 11"
        strokeWidth="3"
      />
      <path
        className={`${ROUND} auth-il-purple-stroke`}
        d="M78 88v10"
        strokeWidth="3"
      />
    </Spot>
  );
}

/** Two people with arrows between them: account recovery. */
export function RecoveryIllustration() {
  return (
    <Spot testId="auth-illustration-recovery">
      <circle className="auth-il-calm-orange" cx="100" cy="82" r="66" />
      <circle
        className={`auth-il-orange ${LINE}`}
        cx="78"
        cy="72"
        r="28"
        strokeWidth="3"
      />
      <circle className="auth-il-surface" cx="78" cy="64" r="9" />
      <path className="auth-il-surface" d="M62 90c3-9 9-13 16-13s13 4 16 13z" />
      <circle
        className={`auth-il-blue ${LINE}`}
        cx="124"
        cy="84"
        r="28"
        strokeWidth="3"
      />
      <circle className="auth-il-surface" cx="124" cy="76" r="9" />
      <path
        className="auth-il-surface"
        d="M108 102c3-9 9-13 16-13s13 4 16 13z"
      />
      <path
        className={`${ROUND} auth-il-ink`}
        d="M70 124h54l-7-7M130 134H76l7 7"
        strokeWidth="3"
      />
    </Spot>
  );
}

/** A padlock with a clock: an expired or invalid link. */
export function ExpiredLinkIllustration() {
  return (
    <Spot testId="auth-illustration-expired">
      <circle className="auth-il-calm-red" cx="100" cy="82" r="66" />
      <path
        className={`${ROUND} ${LINE}`}
        d="M80 70V56a20 20 0 0 1 40 0v14"
        strokeWidth="6"
      />
      <rect
        className={`auth-il-surface ${LINE}`}
        height="58"
        rx="14"
        strokeWidth="3"
        width="72"
        x="64"
        y="66"
      />
      <circle className="auth-il-red-ink" cx="100" cy="90" r="6" />
      <path
        className={`${ROUND} auth-il-red-stroke`}
        d="M100 94v12"
        strokeWidth="4"
      />
      <circle
        className={`auth-il-red ${LINE}`}
        cx="140"
        cy="118"
        r="18"
        strokeWidth="3"
      />
      <path
        className={`${ROUND} auth-il-ink`}
        d="M140 108v10l7 5"
        strokeWidth="3"
      />
    </Spot>
  );
}
