'use client';

import { Loader2, LockKeyhole, ShieldCheck } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode, Ref } from 'react';
import { MiraJoinBox } from '../../live-assistant/mira-join-box';
import { GuestTurnstile } from '../components/guest-turnstile';
import { MEET_GUEST_NAME_MAX } from '../lib/guest-session';
import { PrejoinNameField } from './prejoin-name-field';
import { PrejoinStage, type PrejoinPhase } from './prejoin-stage';
import { usePrejoinCapture } from './use-prejoin-capture';

/** What the guest card's state machine tells the stage; the stage never owns it. */
export type GuestPrejoinState =
  | { kind: 'verifying' }
  | { kind: 'verified' }
  | { kind: 'submitting'; askingHost: boolean }
  | { kind: 'failed'; message: string };

/**
 * The pre-join stage for a person with no account: name, the human check with
 * its puzzle fallback, the Mira box and Ask to join, beside the camera preview.
 * Guests are admitted by the host, so the primary action asks to join.
 */
export function GuestPrejoin({
  title,
  meetingId,
  siteKey,
  name,
  nameRef,
  onNameChange,
  state,
  statusLabel,
  canAskHost,
  stalled,
  widget,
  miraTicked,
  onMiraChange,
  onToken,
  onHumanPass,
  onTokenLost,
  onStalledChange,
  onSubmit,
  onAskHost,
  returnTo,
  script,
}: {
  title: string;
  meetingId: string;
  siteKey: string;
  name: string;
  nameRef: Ref<HTMLInputElement>;
  onNameChange: (value: string) => void;
  state: GuestPrejoinState;
  statusLabel: string;
  canAskHost: boolean;
  stalled: boolean;
  /** A single-use Turnstile token needs a fresh widget after each attempt. */
  widget: number;
  miraTicked: boolean;
  onMiraChange: (checked: boolean) => void;
  onToken: (token: string) => void;
  onHumanPass: (token: string) => void;
  onTokenLost: () => void;
  onStalledChange: (stalled: boolean) => void;
  onSubmit: () => void;
  onAskHost: () => void;
  returnTo: string;
  /** The early Turnstile script the server rendered under the response nonce. */
  script?: ReactNode;
}) {
  const t = useTranslations('meet.call.guest_join');
  const capture = usePrejoinCapture();
  const busy = state.kind === 'submitting';
  const label = t('ask_to_join');
  const phase: PrejoinPhase =
    state.kind === 'submitting'
      ? { kind: 'saving', label }
      : {
          kind: 'ready',
          label,
          disabled: state.kind !== 'verified' || !name.trim(),
        };
  return (
    <>
      {script}
      <PrejoinStage
        capture={capture}
        consent={
          <MiraJoinBox
            checked={miraTicked}
            disabled={busy}
            onCheckedChange={onMiraChange}
          />
        }
        eyebrow={t('badge')}
        fields={
          <>
            <PrejoinNameField
              disabled={busy}
              hint={t('name_hint')}
              id="meet-guest-display-name"
              inputRef={nameRef}
              label={t('name_label')}
              maxLength={MEET_GUEST_NAME_MAX}
              onChange={onNameChange}
              placeholder={t('name_placeholder')}
            />
            <div className="min-h-[93px] space-y-2">
              <GuestTurnstile
                key={widget}
                meetingId={meetingId}
                onHumanPass={onHumanPass}
                onStalledChange={onStalledChange}
                onToken={onToken}
                onTokenLost={onTokenLost}
                siteKey={siteKey}
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
                  <ShieldCheck
                    aria-hidden="true"
                    className="size-4 text-primary"
                  />
                ) : state.kind === 'verifying' ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 motion-safe:animate-spin"
                  />
                ) : null}
                {statusLabel}
              </p>
            </div>
          </>
        }
        name={name}
        onSubmit={onSubmit}
        phase={phase}
        secondary={
          <>
            {state.kind !== 'verified' && (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={!canAskHost}
                  onClick={onAskHost}
                  type="button"
                  variant={stalled ? 'secondary' : 'ghost'}
                >
                  {state.kind === 'submitting' && state.askingHost && (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  )}
                  {t('ask_host_without_verification')}
                </Button>
                <p className="text-muted-foreground text-xs">
                  {t('ask_host_without_verification_hint')}
                </p>
              </div>
            )}
            <div className="flex items-center gap-3 text-muted-foreground text-xs">
              <Separator className="flex-1" />
              {t('or')}
              <Separator className="flex-1" />
            </div>
            <Button asChild className="w-full" variant="outline">
              <Link href={`/login?next=${encodeURIComponent(returnTo)}`}>
                {t('sign_in')}
              </Link>
            </Button>
            <p className="flex items-start gap-2 text-muted-foreground text-xs">
              <LockKeyhole
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              {t('admission_hint')}
            </p>
          </>
        }
        title={title}
      />
    </>
  );
}
