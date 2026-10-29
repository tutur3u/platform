'use client';

import { AudioLines, CircleSlash } from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext } from 'react';
import type { TranscriptionConsent } from './use-transcription-consent';

const ConsentContext = createContext<TranscriptionConsent | null>(null);

export function TranscriptionConsentProvider({
  value,
  children,
}: {
  value: TranscriptionConsent;
  children: ReactNode;
}) {
  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useTranscriptionConsentContext() {
  return useContext(ConsentContext);
}

/** Small per-participant mic badge: transcribed, excluded, or awaiting a choice. */
export function TranscriptionBadge({
  participant,
}: {
  participant: MeetRealtimePresence;
}) {
  const t = useTranslations('meet.consent');
  const state = useContext(ConsentContext)?.badgeFor(participant);
  if (!state) return null;
  const label = t(`badge_${state}`);
  const Icon = state === 'transcribed' ? AudioLines : CircleSlash;
  return (
    <span
      title={label}
      className={
        state === 'transcribed'
          ? 'grid size-6 shrink-0 place-items-center rounded-full bg-dynamic-blue/15 text-dynamic-blue'
          : 'grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground'
      }
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Host roster header: how many people in the call are being transcribed. */
export function TranscriptionRosterSummary({
  participants,
}: {
  participants: MeetRealtimePresence[];
}) {
  const t = useTranslations('meet.consent');
  const consent = useContext(ConsentContext);
  if (!consent?.isStarter) return null;
  const states = participants.map((person) => consent.badgeFor(person));
  return (
    <p className="px-4 pb-2 text-muted-foreground text-xs">
      {t('roster_summary', {
        transcribed: states.filter((s) => s === 'transcribed').length,
        total: participants.length,
        pending: states.filter((s) => s === 'pending').length,
      })}
      {consent.rosterAvailable ? null : ` ${t('roster_unavailable')}`}
    </p>
  );
}
