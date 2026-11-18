'use client';
import { useQuery } from '@tanstack/react-query';
import { Clock, FileText, Users, Video } from '@tuturuuu/icons';
import { readMeetRecordings } from '@tuturuuu/internal-api';
import { useMeetingAi } from '@tuturuuu/meet-core/features/meeting-ai/use-meeting-ai';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { endedMeetingFacts } from '../lib/ended-meeting-facts';

type Tone = 'neutral' | 'done' | 'pending';

/**
 * Duration, speakers, recording and transcript state for an ended meeting.
 * Only note readers query anything: the meet-ai state shares the notes
 * reader's cache, and a recordings refusal stays an unknown fact.
 */
export function EndedMeetingFactsRow({
  wsId,
  meetingId,
  canSeeNotes,
}: {
  wsId: string;
  meetingId: string;
  canSeeNotes: boolean;
}) {
  const t = useTranslations('meet.call');
  const ai = useMeetingAi(wsId, meetingId, [], false, canSeeNotes);
  const records = useQuery({
    queryKey: ['meet-recordings', meetingId],
    queryFn: () => readMeetRecordings(meetingId),
    enabled: canSeeNotes,
    retry: false,
  });
  if (!canSeeNotes) return null;
  const facts = endedMeetingFacts({
    ai: ai.data,
    recordings: records.error ? null : records.data?.recordings,
  });
  const chips: Array<{
    key: string;
    tone: Tone;
    icon: ReactNode;
    label: string;
  }> = [];
  if (facts.minutes !== null)
    chips.push({
      key: 'minutes',
      tone: 'neutral',
      icon: <Clock className="size-3.5" />,
      label: t('ended_minutes', { minutes: facts.minutes }),
    });
  if (facts.speakers !== null)
    chips.push({
      key: 'speakers',
      tone: 'neutral',
      icon: <Users className="size-3.5" />,
      label: t('ended_speakers', { count: facts.speakers }),
    });
  if (facts.recording === 'saved' || facts.recording === 'processing')
    chips.push({
      key: 'recording',
      tone: facts.recording === 'saved' ? 'done' : 'pending',
      icon: <Video className="size-3.5" />,
      label: t(
        facts.recording === 'saved'
          ? 'ended_recording_saved'
          : 'ended_recording_processing'
      ),
    });
  if (facts.transcript === 'ready' || facts.transcript === 'processing')
    chips.push({
      key: 'transcript',
      tone: facts.transcript === 'ready' ? 'done' : 'pending',
      icon: <FileText className="size-3.5" />,
      label: t(
        facts.transcript === 'ready'
          ? 'ended_transcript_ready'
          : 'ended_transcript_processing'
      ),
    });
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" data-testid="ended-meeting-facts">
      {chips.map((chip) => (
        <li
          key={chip.key}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
            chip.tone === 'neutral' && 'text-muted-foreground',
            chip.tone === 'done' &&
              'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
            chip.tone === 'pending' &&
              'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
          )}
        >
          {chip.icon}
          {chip.label}
        </li>
      ))}
    </ul>
  );
}
