'use client';
import { Volume2, VolumeX } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { describeScreenAudio } from '../lib/screen-capture';
import { useStreamReadiness } from './media-receiving-status';

export function ScreenAudioStatus({ stream }: { stream: MediaStream }) {
  const t = useTranslations('meet.call');
  const { audio } = useStreamReadiness(stream);
  // Re-read on every audio readiness change, so an ended audio track updates
  // the explanation as well as the badge.
  const { reason } = describeScreenAudio(stream);
  const sharing = audio && reason === 'sharing';
  // A present but silent track has no specific cause to name.
  const explanation = reason === 'sharing' ? 'unknown' : reason;
  const Icon = sharing ? Volume2 : VolumeX;
  return (
    <div
      className="flex max-w-xs items-start gap-2 rounded-lg border bg-background/95 px-3 py-2 text-xs"
      role="status"
      title={t('screen_audio_hint')}
    >
      <Icon className="mt-px size-4 shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span>{t(sharing ? 'screen_audio_on' : 'screen_audio_off')}</span>
        {!sharing && (
          <span className="text-muted-foreground">
            {t(`screen_audio_reason_${explanation}`)}
          </span>
        )}
      </span>
    </div>
  );
}
