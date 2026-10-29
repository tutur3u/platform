'use client';

import { Circle } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { TranscriptionConsent } from './use-transcription-consent';

/** Persistent "Transcribing" status for everyone in the call. */
export function TranscriptionPill({
  consent,
  onOpen,
}: {
  consent: TranscriptionConsent;
  onOpen: () => void;
}) {
  const t = useTranslations('meet.consent');
  if (!consent.active) return null;
  const own = consent.isStarter
    ? t('pill_roster')
    : consent.selfDecision === undefined
      ? t('pill_you_pending')
      : consent.selfDecision
        ? t('pill_you_allowed')
        : t('pill_you_excluded');
  return (
    <output aria-live="polite">
      <button
        type="button"
        onClick={onOpen}
        className="motion-safe:fade-in motion-safe:zoom-in-95 inline-flex h-8 items-center gap-1.5 rounded-full bg-dynamic-blue/10 px-2.5 text-dynamic-blue text-xs motion-safe:animate-in"
      >
        <Circle
          aria-hidden="true"
          className="size-2 fill-current motion-safe:animate-pulse"
        />
        <span className="font-medium">{t('pill')}</span>
        <span className="text-foreground/70">{own}</span>
      </button>
    </output>
  );
}
