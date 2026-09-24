'use client';
import type { MeetAiChunk } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
export function MeetingTranscript({ chunks }: { chunks: MeetAiChunk[] }) {
  const t = useTranslations('meet.ai');
  return (
    <section
      className="max-h-80 space-y-2 overflow-y-auto"
      aria-label={t('transcript')}
    >
      <h3 className="font-medium text-sm">{t('transcript')}</h3>
      {!chunks.length && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      {chunks.flatMap((chunk) => {
        const segments = chunk.segments?.length
          ? chunk.segments
          : [
              {
                speaker: chunk.speaker,
                kind: chunk.speaker?.kind,
                startSeconds: chunk.start_seconds,
                transcript: chunk.transcript,
              },
            ];
        return [...segments]
          .sort((a, b) => a.startSeconds - b.startSeconds)
          .map((segment, index) => (
            <p key={`${chunk.id}:${index}`} className="text-sm">
              <span className="mr-2 text-muted-foreground text-xs">
                {Math.floor(segment.startSeconds / 60)}:
                {String(Math.floor(segment.startSeconds % 60)).padStart(2, '0')}
              </span>
              <span className="mb-1 block break-words font-medium">
                {segment.speaker?.displayName ?? t('speaker_unknown')}
                {segment.kind && (
                  <span className="ml-2 font-normal text-muted-foreground text-xs">
                    {t(
                      segment.kind === 'shared_audio'
                        ? 'speaker_shared_audio'
                        : 'speaker_microphone'
                    )}
                  </span>
                )}
              </span>
              {segment.transcript ||
                t(
                  chunk.status === 'processing'
                    ? 'processing'
                    : chunk.status === 'failed'
                      ? 'missing'
                      : 'silence'
                )}
            </p>
          ));
      })}
    </section>
  );
}
