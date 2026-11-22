'use client';

import { DEFAULT_SCRIPT_ID, Turnstile } from '@marsidev/react-turnstile';
import {
  readTurnstileScriptNonce,
  SAFARI_SAFE_TURNSTILE_OPTIONS,
} from '@tuturuuu/cloudflare/turnstile/client';
import { useEffect, useRef, useState } from 'react';

/** How long the check may take to appear before the form gives up on it. */
export const NAME_CHECK_START_TIMEOUT_MS = 20_000;
/** The flexible widget needs 300px; below this viewport the form is narrower. */
const FLEXIBLE_WIDGET_VIEWPORT = '(min-width: 24rem)';

/**
 * The browser check for one refused save. It reports exactly one outcome while
 * it is on screen: a second success, or an error after a success, would
 * otherwise send the one-use token twice or reopen the form while the save is
 * pending, and a callback kept by the widget after the visitor left would save
 * a name nobody is waiting for.
 */
export function ParticipantNameCheck({
  siteKey,
  onToken,
  onFailure,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onFailure: () => void;
}) {
  const active = useRef(false);
  const settled = useRef(false);
  const started = useRef(false);
  const [size] = useState<'flexible' | 'compact'>(() =>
    window.matchMedia?.(FLEXIBLE_WIDGET_VIEWPORT).matches === false
      ? 'compact'
      : 'flexible'
  );

  const settle = (outcome: () => void) => {
    if (!active.current || settled.current) return;
    settled.current = true;
    outcome();
  };
  /** A failed script tag stays in the page and blocks the next injection. */
  const failToStart = () =>
    settle(() => {
      document.getElementById(DEFAULT_SCRIPT_ID)?.remove();
      onFailure();
    });
  const giveUp = useRef(failToStart);
  giveUp.current = failToStart;

  useEffect(() => {
    active.current = true;
    // A blocked or stalled script never calls back; give up so the form unlocks.
    const timer = setTimeout(() => {
      if (!started.current) giveUp.current();
    }, NAME_CHECK_START_TIMEOUT_MS);
    return () => {
      active.current = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <Turnstile
      siteKey={siteKey}
      options={{ ...SAFARI_SAFE_TURNSTILE_OPTIONS, size }}
      scriptOptions={{
        nonce: readTurnstileScriptNonce(),
        onError: failToStart,
      }}
      onWidgetLoad={() => {
        started.current = true;
      }}
      onSuccess={(token) => settle(() => onToken(token))}
      onError={() => settle(onFailure)}
      onUnsupported={() => settle(onFailure)}
    />
  );
}
