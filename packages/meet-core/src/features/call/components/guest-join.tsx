'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import {
  readTurnstileScriptNonce,
  SAFARI_SAFE_TURNSTILE_OPTIONS,
} from '@tuturuuu/cloudflare/turnstile/client';
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
import { useRef, useState, useTransition } from 'react';
import { MEET_GUEST_NAME_MAX } from '../lib/guest-session';

/** One state at a time: the check and the request never disagree. */
export type GuestJoinState =
  | { kind: 'verifying' }
  | { kind: 'verified'; token: string }
  | { kind: 'submitting'; token: string }
  | {
      kind: 'failed';
      reason:
        | 'turnstile'
        | 'rate_limited'
        | 'removed'
        | 'unavailable'
        | 'network';
    };

export function guestJoinFailure(
  error: unknown
): Extract<GuestJoinState, { kind: 'failed' }>['reason'] {
  if (!(error instanceof InternalApiError)) return 'network';
  if (error.code === 'MEET_GUEST_RATE_LIMITED') return 'rate_limited';
  if (error.code === 'MEET_GUEST_TURNSTILE_FAILED') return 'turnstile';
  if (error.code === 'MEET_GUEST_REMOVED') return 'removed';
  if (error.status === 403 || error.status === 404) return 'unavailable';
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
  const captcha = useRef<TurnstileInstance | null>(null);
  const [name, setName] = useState('');
  const [state, setState] = useState<GuestJoinState>({ kind: 'verifying' });
  const [refreshing, startTransition] = useTransition();
  const busy = state.kind === 'submitting' || refreshing;
  const canSubmit = state.kind === 'verified' && !!name.trim() && !busy;

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
        onSubmit={async (event) => {
          event.preventDefault();
          if (state.kind !== 'verified' || !name.trim() || busy) return;
          const token = state.token;
          setState({ kind: 'submitting', token });
          try {
            await joinMeetCallAsGuest(meetingId, {
              displayName: name.trim(),
              turnstileToken: token,
            });
            startTransition(() => router.refresh());
          } catch (error) {
            // A Turnstile token is single-use; every retry needs a fresh check.
            captcha.current?.reset();
            setState({ kind: 'failed', reason: guestJoinFailure(error) });
          }
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
          <Turnstile
            ref={captcha}
            siteKey={siteKey}
            options={{ ...SAFARI_SAFE_TURNSTILE_OPTIONS, size: 'flexible' }}
            scriptOptions={{ nonce: readTurnstileScriptNonce() }}
            onSuccess={(token) => setState({ kind: 'verified', token })}
            onExpire={() => setState({ kind: 'verifying' })}
            onError={() => setState({ kind: 'failed', reason: 'turnstile' })}
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
