'use client';

import { Check, Loader2, Pause } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { RoomMiraSelfChoice } from '../call/components/room-mira-notice';
import { useRoomMiraConsent } from '../call/components/use-room-mira';
import { useSelfCaptureHold } from './self-hold';
import type { SelfCaptureState } from './self-lifecycle';
import { useSelfNoticeText } from './self-notice-text';
import { readSelfRoom } from './self-room';
import { TranscriptConsentDetails } from './transcript-consent-details';
import { useTranscriptConsent } from './use-transcript-consent';

/**
 * Recording indicator and consent choice for every admitted participant,
 * guests included. It appears while the host's transcript runs and opens on
 * its own until this person chooses.
 */
export function TranscriptConsentNotice({
  meetingId,
  wsId,
  capture,
  names = {},
  guest = false,
}: {
  meetingId: string;
  wsId?: string;
  /** This participant's own per-speaker capture state. */
  capture?: SelfCaptureState;
  /** Display names by account id, for the host's coverage list. */
  names?: Record<string, string>;
  guest?: boolean;
}) {
  const t = useTranslations('meet.ai');
  const locale = useLocale();
  const noticeText = useSelfNoticeText();
  const { consent, choose } = useTranscriptConsent(
    meetingId,
    true,
    wsId ? { wsId, noticeText, locale } : undefined
  );
  const held = useSelfCaptureHold(meetingId);
  const [open, setOpen] = useState<boolean | null>(null);
  // An Allow needs the caller's own Mira choice on, so the Mira box comes
  // first. While Mira's state loads, Allow waits; on an error or where room
  // Mira is unavailable the plain Allow shows (the room still refuses an
  // Allow from anyone who is off).
  const mira = useRoomMiraConsent(meetingId);
  const miraOff = !!mira.data?.available && mira.data.choice !== 'on';
  // Without a host acceptance nobody can turn Mira on for themselves.
  const miraNotOn = !!mira.data?.available && !mira.data.acceptance;
  const miraPending = mira.isPending;
  if (!consent?.available || !consent.active) return null;
  const room = readSelfRoom(consent);
  // One person's opt-out never pauses the others, so the room fence does not
  // describe a per-speaker meeting.
  const solo = room.mode === 'self';
  // Guests never contribute in a per-speaker meeting; there is nothing to
  // allow, only the reason.
  const selfGuest = solo && (guest || capture?.kind === 'guest');
  // A decline or Mira off that has not been confirmed reads as declined.
  const choice =
    solo && held && consent.choice === 'allow' ? 'decline' : consent.choice;
  const needsChoice = choice === null && !selfGuest;
  const live = solo ? !!room.session : consent.fence.ready;
  const pick = (next: 'allow' | 'decline') =>
    choose.mutate(next, {
      onSuccess: () => setOpen(false),
      onError: () => toast.error(t('consent_failed')),
    });
  return (
    <Popover open={open ?? needsChoice} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={needsChoice ? 'default' : 'ghost'}
          className="h-9 gap-2 px-2"
          aria-label={t('consent_title')}
        >
          <span
            aria-hidden
            className={`size-2 rounded-full ${
              live
                ? 'bg-dynamic-red motion-safe:animate-pulse'
                : 'bg-dynamic-yellow'
            }`}
          />
          <span className="max-sm:sr-only">
            {live ? t('indicator_live') : t('indicator_paused')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] space-y-3 text-sm"
      >
        <TranscriptConsentDetails
          room={room}
          fence={consent.fence}
          capture={selfGuest ? { kind: 'guest' } : capture}
          names={names}
          meetingId={meetingId}
          wsId={wsId}
        />
        {choice && !selfGuest && (
          <p className="text-muted-foreground text-xs">
            {choice === 'allow'
              ? t('consent_you_allowed')
              : t(solo ? 'self_untick' : 'consent_you_declined')}
          </p>
        )}
        {miraOff && choice !== 'allow' && !selfGuest && (
          <div className="space-y-2">
            <p role="status" className="text-xs">
              {miraNotOn ? t('consent_mira_not_on') : t('consent_mira_off')}
            </p>
            <RoomMiraSelfChoice meetingId={meetingId} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {choice !== 'allow' && !miraOff && !selfGuest && (
            <Button
              type="button"
              size="sm"
              disabled={choose.isPending || miraPending}
              onClick={() => pick('allow')}
            >
              {choose.isPending || miraPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Check aria-hidden className="size-4" />
              )}
              {t('consent_allow')}
            </Button>
          )}
          {choice !== 'decline' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={choose.isPending}
              onClick={() => pick('decline')}
            >
              <Pause aria-hidden className="size-4" />
              {t('consent_decline')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
