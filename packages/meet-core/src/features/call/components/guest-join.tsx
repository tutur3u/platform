'use client';

import { Loader2, LockKeyhole, ShieldCheck, Video } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api';
import { joinMeetCallAsGuest } from '@tuturuuu/internal-api/meet-call';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState, useTransition } from 'react';
import { MEET_GUEST_NAME_MAX } from '../lib/guest-session';
import { GuestTurnstile } from './guest-turnstile';

/** One state at a time: the check and the request never disagree. */
export type GuestJoinState =
  | { kind: 'verifying' }
  | { kind: 'verified'; token: string }
  /** `token: null` asks the host without a Turnstile token. */
  | { kind: 'submitting'; token: string | null }
  | {
      kind: 'failed';
      reason:
        | 'turnstile'
        | 'verification_required'
        | 'rate_limited'
        | 'removed'
        | 'unavailable'
        | 'network';
    };

export function guestJoinFailure(
  error: unknown
): Extract<GuestJoinState, { kind: 'failed' }>['reason'] {
  if (!(error instanceof InternalApiError)) return 'network';
  const { code, status } = error as { code?: string; status?: number };
  if (code === 'MEET_GUEST_RATE_LIMITED') return 'rate_limited';
  if (code === 'MEET_GUEST_TURNSTILE_FAILED') return 'turnstile';
  if (code === 'MEET_GUEST_VERIFICATION_REQUIRED')
    return 'verification_required';
  if (code === 'MEET_GUEST_REMOVED') return 'removed';
  if (status === 403 || status === 404) return 'unavailable';
  return 'network';
}

export function MeetGuestJoin({
  meetingId,
  meetingTitle,
  returnTo,
  siteKey,
}: {
  meetingId: string;
  /** Shown only when the host made the meeting details public. */
  meetingTitle?: string;
  returnTo: string;
  siteKey: string;
}) {
  const t = useTranslations('meet.call.guest_join');
  const router = useRouter();
  const [name, setName] = useState('');
  const [state, setState] = useState<GuestJoinState>({ kind: 'verifying' });
  const [stalled, setStalled] = useState(false);
  // A Turnstile token is single-use: a fresh widget issues the next one.
  const [widget, setWidget] = useState(0);
  const [refreshing, startTransition] = useTransition();
  const busy = state.kind === 'submitting' || refreshing;
  const canSubmit = state.kind === 'verified' && !!name.trim() && !busy;
  const canAskHost = stalled && !!name.trim() && !busy;
  const onToken = useCallback(
    (token: string) => setState({ kind: 'verified', token }),
    []
  );
  const onTokenLost = useCallback(
    () =>
      setState((current) =>
        current.kind === 'verified' ? { kind: 'verifying' } : current
      ),
    []
  );

  const join = async (token: string | null) => {
    setState({ kind: 'submitting', token });
    try {
      await joinMeetCallAsGuest(meetingId, {
        displayName: name.trim(),
        ...(token ? { turnstileToken: token } : { hostApproval: true }),
      });
      startTransition(() => router.refresh());
    } catch (error) {
      if (token) setWidget((value) => value + 1);
      setState({ kind: 'failed', reason: guestJoinFailure(error) });
    }
  };

  const status = (() => {
    switch (state.kind) {
      case 'verifying':
        return t('verifying');
      case 'verified':
      case 'submitting':
        return t('verified');
      case 'failed':
        return t(`error_${state.reason}`);
      default: {
        const unreachable: never = state;
        return unreachable;
      }
    }
  })();

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <form
        className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (state.kind !== 'verified' || !name.trim() || busy) return;
          void join(state.token);
        }}
      >
        <div className="flex items-center gap-3 text-muted-foreground">
          <Video aria-hidden="true" className="size-5" />
          <span className="font-medium text-sm">Tuturuuu Meet</span>
        </div>
        <h1 className="break-words font-semibold text-2xl tracking-tight">
          {meetingTitle || t('title')}
        </h1>
        <div className="space-y-2">
          <Label htmlFor="meet-guest-display-name">{t('name_label')}</Label>
          <Input
            id="meet-guest-display-name"
            autoComplete="name"
            maxLength={MEET_GUEST_NAME_MAX}
            placeholder={t('name_placeholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            required
          />
          <p className="text-muted-foreground text-xs">{t('name_hint')}</p>
        </div>
        <div className="space-y-2">
          <GuestTurnstile
            key={widget}
            siteKey={siteKey}
            onToken={onToken}
            onTokenLost={onTokenLost}
            onStalledChange={setStalled}
          />
          <p
            aria-live="polite"
            className={
              state.kind === 'failed'
                ? 'text-destructive text-sm'
                : 'flex items-center gap-1.5 text-muted-foreground text-sm'
            }
          >
            {state.kind === 'verified' || state.kind === 'submitting' ? (
              <ShieldCheck aria-hidden="true" className="size-4" />
            ) : null}
            {status}
          </p>
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!canSubmit}
        >
          {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
          {t('ask_to_join')}
        </Button>
        {stalled ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={!canAskHost}
              onClick={() => void join(null)}
            >
              {state.kind === 'submitting' && state.token === null && (
                <Loader2 aria-hidden="true" className="animate-spin" />
              )}
              {t('ask_host_without_verification')}
            </Button>
            <p className="text-muted-foreground text-xs">
              {t('ask_host_without_verification_hint')}
            </p>
          </div>
        ) : null}
        <div className="flex items-center gap-3 text-muted-foreground text-xs">
          <Separator className="flex-1" />
          {t('or')}
          <Separator className="flex-1" />
        </div>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href={`/login?next=${encodeURIComponent(returnTo)}`}>
            {t('sign_in')}
          </Link>
        </Button>
        <p className="flex items-start justify-center gap-2 text-muted-foreground text-xs">
          <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
          {t('admission_hint')}
        </p>
      </form>
    </main>
  );
}
