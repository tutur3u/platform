'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

/** Two short tones: rising when transcription starts, falling when it stops. */
export function playTranscriptionChime(starting: boolean) {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return;
  try {
    const context = new AudioContext();
    const gain = context.createGain();
    gain.connect(context.destination);
    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    for (const [index, frequency] of (starting
      ? [660, 880]
      : [880, 660]
    ).entries()) {
      const tone = context.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = frequency;
      tone.connect(gain);
      tone.start(now + index * 0.14);
      tone.stop(now + index * 0.14 + 0.16);
    }
    window.setTimeout(() => void context.close().catch(() => {}), 600);
  } catch {
    // Audio cues are best effort; the pill and toast still announce the change.
  }
}

/**
 * Announce every start and stop to everyone in the call. A late joiner whose
 * first view is an active session hears the start cue too.
 */
export function useTranscriptionCues(active: boolean) {
  const t = useTranslations('meet.consent');
  const previous = useRef<boolean | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = active;
    if (before === null ? !active : before === active) return;
    playTranscriptionChime(active);
    toast(active ? t('started_toast') : t('stopped_toast'), {
      id: 'meet-transcription-state',
    });
  }, [active, t]);
}
