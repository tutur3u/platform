'use client';
import { Volume2, VolumeX } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useStreamReadiness } from './media-receiving-status';

export function ScreenAudioStatus({ stream }: { stream: MediaStream }) {
  const t = useTranslations('meet.call');
  const { audio } = useStreamReadiness(stream);
  const Icon = audio ? Volume2 : VolumeX;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-xs"
      role="status"
      title={t('screen_audio_hint')}
    >
      <Icon className="size-4 shrink-0" />
      <span>{t(audio ? 'screen_audio_on' : 'screen_audio_off')}</span>
    </div>
  );
}
