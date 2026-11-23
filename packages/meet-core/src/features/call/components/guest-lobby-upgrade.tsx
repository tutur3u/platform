'use client';

import { ShieldCheck } from '@tuturuuu/icons';
import { joinMeetCallAsGuest } from '@tuturuuu/internal-api/meet-call';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { MeetRoomController } from '../lib/room-controller';
import { useGuestVerification } from './guest-verification-context';
import { GuestTurnstile } from './guest-turnstile';

/**
 * Keeps the human check running for a guest who asked the host without
 * one. A token or puzzle pass that arrives while waiting upgrades the guest
 * session and reconnects, so the host's lobby drops the Unverified badge and
 * a room that admits verified guests lets them in without another click.
 */
export function GuestLobbyUpgrade({
  room,
  displayName,
}: {
  room: Pick<MeetRoomController, 'renewSession'>;
  displayName: string;
}) {
  const t = useTranslations('meet.call.guest_join');
  const guest = useGuestVerification();
  const [phase, setPhase] = useState<
    'idle' | 'sending' | 'verified' | 'failed'
  >('idle');
  const [widget, setWidget] = useState(0);

  const upgrade = useCallback(
    async (proof: { turnstileToken: string } | { humanPassToken: string }) => {
      if (!guest) return;
      setPhase('sending');
      try {
        await joinMeetCallAsGuest(guest.meetingId, {
          displayName: displayName.trim() || 'Guest',
          ...proof,
        });
        setPhase('verified');
        room.renewSession();
      } catch {
        setPhase('failed');
        setWidget((value) => value + 1);
      }
    },
    [displayName, guest, room]
  );
  const noop = useCallback(() => {}, []);

  if (!guest || guest.verified) return null;
  if (phase === 'verified')
    return (
      <p
        aria-live="polite"
        className="mt-3 flex items-center gap-1.5 text-muted-foreground text-sm"
      >
        <ShieldCheck aria-hidden="true" className="size-4" />
        {t('lobby_upgrade_done')}
      </p>
    );
  return (
    <div
      className="mt-3 space-y-2 rounded-xl border p-4"
      data-testid="guest-lobby-upgrade"
    >
      <p className="font-medium text-sm">{t('lobby_upgrade_title')}</p>
      <p className="text-muted-foreground text-sm">
        {phase === 'failed' ? t('error_turnstile') : t('lobby_upgrade_hint')}
      </p>
      <GuestTurnstile
        key={widget}
        meetingId={guest.meetingId}
        siteKey={guest.siteKey}
        onToken={(token) => void upgrade({ turnstileToken: token })}
        onHumanPass={(token) => void upgrade({ humanPassToken: token })}
        onTokenLost={noop}
        onStalledChange={noop}
      />
    </div>
  );
}
