import {
  createTurnstileRetryScheduler,
  isPermanentTurnstileError,
  type TurnstileRetryScheduler,
} from '@tuturuuu/cloudflare/turnstile/client';

/**
 * How long a guest waits for a Turnstile token before the join page explains
 * why the check may be stuck and offers a manual retry. Safari's tracking
 * protections, iCloud Private Relay, Lockdown Mode and content blockers can
 * leave the widget loaded but never issuing a token, with no callback firing.
 */
export const GUEST_TURNSTILE_WATCHDOG_MS = 5000;
/** Automatic fresh-widget retries (1 s, 2 s, 4 s) before the widget gives way. */
export const GUEST_TURNSTILE_MAX_RETRIES = 3;
/** First fresh-widget delay; it doubles per retry. */
export const GUEST_TURNSTILE_RETRY_BASE_MS = 1000;

export type GuestTurnstilePhase =
  /** Waiting for the widget or the challenge. */
  | 'loading'
  /** Cloudflare asked the guest to interact with the widget. */
  | 'interactive'
  /** A fresh widget is scheduled after a failure. */
  | 'retrying'
  /** Automatic recovery is exhausted or the browser is unsupported. */
  | 'stalled';

export type GuestTurnstileStallReason =
  | 'blocked'
  | 'unsupported'
  | 'configuration';

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';

/**
 * Removes a Turnstile script tag that never defined `window.turnstile`
 * (blocked or failed to load), so the next widget mount injects it again
 * instead of waiting on a dead tag.
 */
export function dropFailedTurnstileScript(doc?: Document) {
  const target =
    doc ?? (typeof document === 'undefined' ? undefined : document);
  if (!target) return false;
  const view = target.defaultView as (Window & { turnstile?: unknown }) | null;
  if (view?.turnstile) return false;
  const script = target.getElementById(TURNSTILE_SCRIPT_ID);
  if (!script) return false;
  script.remove();
  return true;
}

export type GuestTurnstileRecovery = {
  scheduler: TurnstileRetryScheduler;
  /** Handles an `error-callback`; true marks the error as handled. */
  onError: (code?: string | null) => boolean;
  /** Script load failure, watchdog expiry or Turnstile `timeout-callback`. */
  onStall: (source: 'script' | 'watchdog' | 'timeout') => void;
  onUnsupported: () => void;
};

/**
 * Bounded recovery for the guest join widget. Failures schedule a fresh
 * widget after a growing delay (never a synchronous reset, which loops in
 * Safari); permanent configuration errors and exhausted retries move the
 * page to `stalled`, where the guest can retry by hand or ask the host.
 */
export function createGuestTurnstileRecovery({
  remount,
  setPhase,
  setStallReason,
  maxRetries = GUEST_TURNSTILE_MAX_RETRIES,
  baseDelayMs = GUEST_TURNSTILE_RETRY_BASE_MS,
  setTimer,
  clearTimer,
}: {
  remount: () => void;
  setPhase: (phase: GuestTurnstilePhase) => void;
  setStallReason: (reason: GuestTurnstileStallReason) => void;
  maxRetries?: number;
  baseDelayMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}): GuestTurnstileRecovery {
  const stall = (reason: GuestTurnstileStallReason) => {
    scheduler.cancel();
    setStallReason(reason);
    setPhase('stalled');
  };
  const scheduler = createTurnstileRetryScheduler({
    reset: remount,
    onGiveUp: (code) =>
      stall(isPermanentTurnstileError(code) ? 'configuration' : 'blocked'),
    baseDelayMs,
    maxAttempts: maxRetries,
    ...(setTimer ? { setTimer } : {}),
    ...(clearTimer ? { clearTimer } : {}),
  });
  const retry = (code: string) => {
    const before = scheduler.attempts();
    const handled = scheduler.onError(code);
    if (scheduler.attempts() > before) setPhase('retrying');
    return handled;
  };
  return {
    scheduler,
    onError: (code) => retry(code ?? 'unknown'),
    onStall: (source) => {
      retry(source);
    },
    onUnsupported: () => stall('unsupported'),
  };
}
