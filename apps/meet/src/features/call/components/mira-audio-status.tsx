'use client';
import { Mic, MicOff, Volume2, VolumeX } from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';

export function MiraAudioStatus({
  participant,
}: {
  participant: MeetRealtimePresence;
}) {
  const t = useTranslations('meet.live');
  const input = !!participant.assistantAudio?.microphoneEnabled;
  const output = !!participant.assistantAudio?.speakerEnabled;
  const microphone = input && participant.media.audioEnabled;
  const label = `${t('title')}: ${t(!input ? 'mic_excluded' : microphone ? 'mic_included' : 'meeting_mic_off')}; ${t(output ? 'hearing_mira' : 'mira_deafened')}`;
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-background/80 px-2 py-1 text-foreground"
    >
      <span className="text-[10px]">Mira</span>
      {microphone ? (
        <Mic aria-hidden className="size-3 text-dynamic-green" />
      ) : (
        <MicOff aria-hidden className="size-3 text-muted-foreground" />
      )}
      {output ? (
        <Volume2 aria-hidden className="size-3 text-dynamic-green" />
      ) : (
        <VolumeX aria-hidden className="size-3 text-muted-foreground" />
      )}
    </span>
  );
}
