'use client';

import { Loader2, LockKeyhole, ShieldCheck, Video } from '@tuturuuu/icons';
import { TURNSTILE_ORIGIN } from '@tuturuuu/cloudflare/turnstile/client';
import { InternalApiError } from '@tuturuuu/internal-api';
import { joinMeetCallAsGuest } from '@tuturuuu/internal-api/meet-call';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { preconnect, prefetchDNS } from 'react-dom';
import {
  MiraJoinBox,
  useRememberMiraJoin,
} from '../../live-assistant/mira-join-box';
import { prefersMiraOff } from '../../live-assistant/mira-join-choice';
import { MEET_GUEST_NAME_MAX } from '../lib/guest-session';
import { GUEST_TURNSTILE_SCRIPT_SRC } from '../lib/guest-turnstile-recovery';
import { GuestTurnstile } from './guest-turnstile';

/** One state at a time: the check and the request never disagree. */
export type GuestJoinState =
  | { kind: 'verifying' }
  /** `via: 'human'` marks a pass from the Tuturuuu jigsaw check. */
  | { kind: 'verified'; token: string; via?: 'human' }
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

/** The nonce of the server-rendered Turnstile script, in the browser only. */
function renderedScriptNonce() {
  if (typeof document === 'undefined') return undefined;
  const script = document.getElementById('cf-turnstile-script');
  if (!(script instanceof HTMLScriptElement)) return undefined;
  // Browsers hide the attribute after parsing and expose the property.
  return script.nonce || script.getAttribute('nonce') || undefined;
}

export function MeetGuestJoin({
  meetingId,
  meetingTitle,
  returnTo,
  siteKey,
  scriptNonce,
  miraBoxTickedByDefault = false,
  miraAcceptanceRevision = 0,
}: {
  meetingId: string;
  /** The workspace default for the Mira box; the same on server and client. */
  miraBoxTickedByDefault?: boolean;
  /** The Mira acceptance open when the page loaded; 0 when none. */
  miraAcceptanceRevision?: number;
  /** The response's CSP nonce, for the server-rendered Turnstile script. */
  scriptNonce?: string;
  /** Shown only when the host made the meeting details public. */
  meetingTitle?: string;
  returnTo: string;
  siteKey: string;
}) {
  // Warm the Turnstile origin from the document head (server render
  // included) so the check starts loading while the guest types a name.
  preconnect(TURNSTILE_ORIGIN);
  prefetchDNS(TURNSTILE_ORIGIN);
  // The browser renders the same early script the server sent (its nonce is
  // readable from the element), so hydration never replaces the form.
  const earlyScriptNonce = scriptNonce ?? renderedScriptNonce();
  const t = useTranslations('meet.call.guest_join');
  const router = useRouter();
  const [name, setName] = useState('');
  // The name field is uncontrolled: WebKit can take seconds to hydrate, and
  // a controlled input would erase what the guest typed before that.
  const nameInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const typed = nameInput.current?.value;
    if (typed) setName(typed);
  }, []);
  const [state, setState] = useState<GuestJoinState>({ kind: 'verifying' });
  const [miraTicked, setMiraTicked] = useState(miraBoxTickedByDefault);
  // An untick kept from an earlier visit in this tab stays unticked. It is
  // read after hydration, so the server markup and the first render agree.
  useEffect(() => {
    if (prefersMiraOff(meetingId)) setMiraTicked(false);
  }, [meetingId]);
  const rememberMira = useRememberMiraJoin();
  const [stalled, setStalled] = useState(false);
  // A Turnstile token is single-use: a fresh widget issues the next one.
  const [widget, setWidget] = useState(0);
  const [refreshing, startTransition] = useTransition();
  const busy = state.kind === 'submitting' || refreshing;
  const canSubmit = state.kind === 'verified' && !!name.trim() && !busy;
  // Asking the host is always available: no browser is ever left without a
  // way in. It stays secondary to the verified join.
  const canAskHost = state.kind !== 'verified' && !!name.trim() && !busy;
  const onToken = useCallback(
    (token: string) => setState({ kind: 'verified', token }),
    []
  );
  const onHumanPass = useCallback(
    (token: string) => setState({ kind: 'verified', token, via: 'human' }),
    []
  );
  const onTokenLost = useCallback(
    () =>
      setState((current) =>
        current.kind === 'verified' ? { kind: 'verifying' } : current
      ),
    []
  );

  const join = async (token: string | null, via?: 'human') => {
    setState({ kind: 'submitting', token });
    try {
      // Recorded for after admission; both join paths carry the final state.
      // It runs beside the join request and never rejects, so it cannot hold
      // the join back; the page refreshes only once it has been kept.
      const remembered = rememberMira(
        meetingId,
        miraTicked,
        miraAcceptanceRevision
      ).catch(() => undefined);
      await joinMeetCallAsGuest(meetingId, {
        displayName: name.trim(),
        ...(!token
          ? { hostApproval: true }
          : via === 'human'
            ? { humanPassToken: token }
            : { turnstileToken: token }),
      });
      await remembered;
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
      {earlyScriptNonce ? (
        <script
          async
          id="cf-turnstile-script"
          nonce={earlyScriptNonce}
          src={GUEST_TURNSTILE_SCRIPT_SRC}
        />
      ) : null}
      <form
        className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (state.kind !== 'verified' || !name.trim() || busy) return;
          void join(state.token, state.via);
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
            ref={nameInput}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            required
          />
          <p className="text-muted-foreground text-xs">{t('name_hint')}</p>
        </div>
        <div className="min-h-[93px] space-y-2">
          <GuestTurnstile
            key={widget}
            meetingId={meetingId}
            siteKey={siteKey}
            onToken={onToken}
            onHumanPass={onHumanPass}
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
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
            ) : state.kind === 'verifying' ? (
              <Loader2
                aria-hidden="true"
                className="size-4 motion-safe:animate-spin"
              />
            ) : null}
            {status}
          </p>
        </div>
        <MiraJoinBox
          checked={miraTicked}
          onCheckedChange={setMiraTicked}
          disabled={busy}
        />
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!canSubmit}
        >
          {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
          {t('ask_to_join')}
        </Button>
        {state.kind !== 'verified' ? (
          <div className="space-y-2">
            <Button
              type="button"
              variant={stalled ? 'secondary' : 'ghost'}
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
