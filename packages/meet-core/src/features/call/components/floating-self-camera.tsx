'use client';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import { ParticipantTile } from './participant-tile';
import { SelfPreviewPip } from './self-preview-pip';

/** The local camera as a draggable picture-in-picture card over the stage. */
export function FloatingSelfCamera({
  participant,
  stream,
  handRaised,
}: {
  participant: MeetRealtimePresence;
  stream: MediaStream | null;
  handRaised: boolean;
}) {
  const t = useTranslations('meet.call');
  return (
    <SelfPreviewPip label={t('you')}>
      <ParticipantTile
        isSelf
        floating
        className="h-full w-full"
        participant={participant}
        stream={stream}
        resumePlaybackLabel={t('resume_audio')}
        handRaised={handRaised}
      />
    </SelfPreviewPip>
  );
}
