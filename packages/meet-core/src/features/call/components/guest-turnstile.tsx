'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import {
  onTurnstilePageRestore,
  readTurnstileScriptNonce,
  SAFARI_SAFE_TURNSTILE_OPTIONS,
} from '@tuturuuu/cloudflare/turnstile/client';
import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createGuestTurnstileRecovery,
  dropFailedTurnstileScript,
  GUEST_TURNSTILE_WATCHDOG_MS,
  type GuestTurnstilePhase,
  type GuestTurnstileStallReason,
} from '../lib/guest-turnstile-recovery';
import { GuestHumanCheck } from './guest-human-check';

/**
 * The guest join check. It never leaves a guest on an empty box: a
 * watchdog and Turnstile's error, timeout and unsupported callbacks retry
 * with a fresh widget, and once that is exhausted the guest sees why, a
 * manual retry, and (through `onStalledChange`) the host-approval fallback.
 */
export function GuestTurnstile({
  meetingId,
  siteKey,
  onToken,
  onHumanPass,
  onTokenLost,
  onStalledChange,
}: {
  meetingId: string;
  siteKey: string;
  onToken: (token: string) => void;
  /** A pass from the Tuturuuu jigsaw check offered once Turnstile stalls. */
  onHumanPass: (passToken: string) => void;
  onTokenLost: () => void;
  onStalledChange: (stalled: boolean) => void;
}) {
  const t = useTranslations('meet.call.guest_join');
  const [generation, setGeneration] = useState(0);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<GuestTurnstilePhase>('loading');
  const [stallReason, setStallReason] =
    useState<GuestTurnstileStallReason>('blocked');
  // True only once a token has arrived for the current widget.
  const settled = useRef(false);
  const [slow, setSlow] = useState(false);

  const remount = useCallback(() => {
    dropFailedTurnstileScript();
    settled.current = false;
    setSlow(false);
    setPhase('loading');
    setGeneration((value) => value + 1);
  }, []);

  // A manual retry starts a new round with a fresh retry budget.
  // biome-ignore lint/correctness/useExhaustiveDependencies: round resets recovery
  const recovery = useMemo(
    () => createGuestTurnstileRecovery({ remount, setPhase, setStallReason }),
    [remount, round]
  );

  useEffect(() => () => recovery.scheduler.cancel(), [recovery]);
  useEffect(() => {
    onStalledChange(phase === 'stalled');
  }, [onStalledChange, phase]);
  useEffect(
    () =>
      onTurnstilePageRestore(() => {
        onTokenLost();
        remount();
      }),
    [onTokenLost, remount]
  );

  // Watchdog keyed on token arrival: a widget that has not issued a token in
  // time keeps running (the guest may be mid-click), and the page shows why it
  // may be stuck plus a manual retry next to it. Errors, timeouts and
  // unsupported browsers still replace the widget through `recovery`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart per widget
  useEffect(() => {
    if (phase === 'stalled') return;
    const timer = setTimeout(() => {
      if (!settled.current) setSlow(true);
    }, GUEST_TURNSTILE_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [generation]);

  const retryNow = () => {
    recovery.scheduler.cancel();
    setRound((value) => value + 1);
    remount();
  };

  if (phase === 'stalled')
    return (
      <div
        role="alert"
        className="space-y-3 rounded-lg border border-dashed p-4 text-sm"
        data-testid="guest-turnstile-stalled"
      >
        <p className="font-medium">{t('verification_unavailable')}</p>
        <p className="text-muted-foreground">
          {stallReason === 'unsupported'
            ? t('verification_unsupported_hint')
            : t('verification_blocked_hint')}
        </p>
        <GuestHumanCheck meetingId={meetingId} onPass={onHumanPass} />
        <Button type="button" variant="outline" size="sm" onClick={retryNow}>
          <RefreshCw aria-hidden="true" className="size-4" />
          {t('verification_retry')}
        </Button>
      </div>
    );

  return (
    <div className="space-y-2">
      <Turnstile
        key={generation}
        siteKey={siteKey}
        options={{ ...SAFARI_SAFE_TURNSTILE_OPTIONS, size: 'flexible' }}
        scriptOptions={{
          nonce: readTurnstileScriptNonce(),
          onError: () => recovery.onStall('script'),
        }}
        onSuccess={(token) => {
          settled.current = true;
          setSlow(false);
          recovery.scheduler.onSuccess();
          setPhase('loading');
          onToken(token);
        }}
        onExpire={() => {
          settled.current = false;
          onTokenLost();
        }}
        onBeforeInteractive={() => setPhase('interactive')}
        onError={(code) => {
          settled.current = false;
          onTokenLost();
          return recovery.onError(code);
        }}
        onTimeout={() => {
          settled.current = false;
          onTokenLost();
          recovery.onStall('timeout');
        }}
        onUnsupported={() => {
          onTokenLost();
          recovery.onUnsupported();
        }}
      />
      {phase === 'retrying' ? (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {t('verification_retrying')}
        </p>
      ) : slow ? (
        <div
          role="status"
          className="space-y-2 rounded-lg border border-dashed p-3 text-sm"
          data-testid="guest-turnstile-slow"
        >
          <p className="font-medium">{t('verification_slow')}</p>
          <p className="text-muted-foreground">
            {t('verification_blocked_hint')}
          </p>
          <GuestHumanCheck meetingId={meetingId} onPass={onHumanPass} />
          <Button type="button" variant="outline" size="sm" onClick={retryNow}>
            <RefreshCw aria-hidden="true" className="size-4" />
            {t('verification_retry')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
