/**
 * WebKit-safe Turnstile lifecycle helpers shared by every widget surface.
 *
 * Safari's tracking and fingerprinting protections make Turnstile challenges
 * fail transiently (300xxx/600xxx). Cloudflare retries those itself when
 * `retry` is `auto`; resetting the widget from inside `error-callback`
 * aborts that retry and restarts the challenge, so Safari can loop without
 * ever issuing a token. Callers therefore leave transient errors to
 * Cloudflare and only reset after a bounded, growing delay.
 */

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js`;

/** CSP directives Turnstile needs: its script, challenge iframe and API calls. */
export const TURNSTILE_CSP_DIRECTIVES = [
  'script-src',
  'frame-src',
  'child-src',
  'connect-src',
] as const;

/**
 * Adds the Turnstile origin to each Turnstile directive that the policy
 * already restricts. Absent directives stay absent so the helper never
 * narrows a policy; when `default-src` is present, missing Turnstile
 * directives are created from it so the challenge is not blocked by the
 * fallback.
 */
export function withTurnstileCsp(policy: string) {
  const directives = policy
    .split(';')
    .map((directive) => directive.trim().split(/\s+/u))
    .filter((tokens) => tokens[0]);
  const find = (name: string) =>
    directives.find((tokens) => tokens[0]!.toLowerCase() === name);
  const fallback = find('default-src');
  for (const name of TURNSTILE_CSP_DIRECTIVES) {
    const tokens = find(name);
    if (tokens) {
      const sources = tokens.slice(1).filter((source) => source !== "'none'");
      if (!sources.includes(TURNSTILE_ORIGIN)) sources.push(TURNSTILE_ORIGIN);
      tokens.splice(1, tokens.length - 1, ...sources);
    } else if (fallback) {
      directives.push([
        name,
        ...fallback.slice(1).filter((source) => source !== "'none'"),
        TURNSTILE_ORIGIN,
      ]);
    }
  }
  return directives.map((tokens) => tokens.join(' ')).join('; ');
}

/**
 * Widget options that let Cloudflare own retries and refreshes. `render`
 * execution and `always` appearance keep the challenge visible, so a Safari
 * user who must interact with it can see it.
 */
export const SAFARI_SAFE_TURNSTILE_OPTIONS = {
  appearance: 'always',
  execution: 'render',
  refreshExpired: 'auto',
  refreshTimeout: 'auto',
  retry: 'auto',
  retryInterval: 8000,
} as const;

/** Configuration errors that no retry can fix. */
const PERMANENT_TURNSTILE_ERRORS = new Set([
  '110100',
  '110110',
  '110200',
  '110420',
  '110430',
  '400020',
  '400030',
  '400040',
]);

export function isPermanentTurnstileError(code?: string | null) {
  return !!code && PERMANENT_TURNSTILE_ERRORS.has(code);
}

/** Unique container id, so several widgets on one page never share `cf-turnstile`. */
let widgetSequence = 0;
export function createTurnstileWidgetId(prefix = 'cf-turnstile') {
  widgetSequence += 1;
  return `${prefix}-${widgetSequence.toString(36)}`;
}

/** The page's CSP nonce, for injecting the Turnstile script under a nonce policy. */
export function readTurnstileScriptNonce(doc?: Document) {
  const target =
    doc ?? (typeof document === 'undefined' ? undefined : document);
  if (!target) return undefined;
  const meta = target
    .querySelector('meta[name="csp-nonce"]')
    ?.getAttribute('content');
  if (meta) return meta;
  const script = target.querySelector<HTMLScriptElement>('script[nonce]');
  return script?.nonce || script?.getAttribute('nonce') || undefined;
}

export type TurnstileRetryScheduler = {
  /**
   * Handles an `error-callback` code. Returns true when the error is treated
   * as handled (transient), which also tells Turnstile not to rethrow it.
   */
  onError: (code?: string | null) => boolean;
  /** Schedules a delayed reset after a timeout or a stalled challenge. */
  onTimeout: () => void;
  onSuccess: () => void;
  /** Attempts used since the last success. */
  attempts: () => number;
  /** Drops a pending reset, e.g. on unmount; the scheduler stays usable. */
  cancel: () => void;
};

/**
 * Never resets synchronously. The first transient error is left to
 * Cloudflare's own retry; repeated errors reset after an exponential delay,
 * and the scheduler stops after `maxAttempts` so a blocked browser cannot
 * loop forever. Self-contained so tests can run it inside a browser page.
 */
export function createTurnstileRetryScheduler({
  reset,
  onGiveUp,
  baseDelayMs = 2000,
  maxDelayMs = 30_000,
  maxAttempts = 4,
  setTimer = (callback: () => void, ms: number) => setTimeout(callback, ms),
  clearTimer = (id: unknown) =>
    clearTimeout(id as ReturnType<typeof setTimeout>),
}: {
  reset: () => void;
  onGiveUp?: (code?: string | null) => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}): TurnstileRetryScheduler {
  let attempts = 0;
  let timer: unknown = null;
  const permanent = new Set([
    '110100',
    '110110',
    '110200',
    '110420',
    '110430',
    '400020',
    '400030',
    '400040',
  ]);
  const schedule = (code?: string | null) => {
    if (timer !== null) return;
    if (attempts >= maxAttempts) {
      onGiveUp?.(code);
      return;
    }
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempts);
    attempts += 1;
    timer = setTimer(() => {
      timer = null;
      reset();
    }, delay);
  };
  return {
    onError(code) {
      if (code && permanent.has(code)) {
        onGiveUp?.(code);
        return false;
      }
      schedule(code);
      return true;
    },
    onTimeout() {
      schedule('timeout');
    },
    onSuccess() {
      attempts = 0;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
    attempts: () => attempts,
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

/**
 * Safari restores pages from the back/forward cache with the old challenge
 * iframe and an already-spent or expired token. Calls `onRestore` for those
 * restores so the caller can drop the token and reset the widget.
 */
export function onTurnstilePageRestore(onRestore: () => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: PageTransitionEvent) => {
    if (event.persisted) onRestore();
  };
  window.addEventListener('pageshow', listener);
  return () => window.removeEventListener('pageshow', listener);
}
