'use client';
import { Volume2, VolumeX } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { describeScreenAudio } from '../lib/screen-capture';
import { useStreamReadiness } from './media-receiving-status';

/** How long a muted audio track gets to start delivering before it counts as no audio. */
export const PENDING_AUDIO_MS = 5000;

export function ScreenAudioStatus({ stream }: { stream: MediaStream }) {
  const t = useTranslations('meet.call');
  // Subscribes to track mute and end events; the classification is re-read
  // on each of them.
  useStreamReadiness(stream);
  const [waited, setWaited] = useState(false);
  const pending = describeScreenAudio(stream).reason === 'pending';
  // The wait restarts whenever the stream or the track state changes.
  useEffect(() => {
    setWaited(false);
    if (!pending) return;
    const timer = setTimeout(() => setWaited(true), PENDING_AUDIO_MS);
    return () => clearTimeout(timer);
  }, [stream, pending]);
  const { reason } = describeScreenAudio(stream, waited);
  // A muted track may start delivering, so nothing is claimed until it does.
  if (reason === 'pending') return null;
  const Icon = reason === 'sharing' ? Volume2 : VolumeX;
  return (
    <div
      className="flex max-w-xs items-start gap-2 rounded-lg border bg-background/95 px-3 py-2 text-xs"
      role="status"
      title={t('screen_audio_hint')}
    >
      <Icon className="mt-px size-4 shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span>
          {t(reason === 'sharing' ? 'screen_audio_on' : 'screen_audio_off')}
        </span>
        {reason !== 'sharing' && (
          <span className="text-muted-foreground">
            {t(`screen_audio_reason_${reason}`)}
          </span>
        )}
      </span>
    </div>
  );
}
