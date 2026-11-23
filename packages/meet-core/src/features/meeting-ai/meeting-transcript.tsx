'use client';
import { ArrowDown, Loader2 } from '@tuturuuu/icons';
import type { MeetAiChunk } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef, useState } from 'react';
import { transcriptBlocks, transcriptTime } from './transcript-blocks';

/**
 * The meeting transcript as speaker blocks with timestamps. While live it
 * follows new lines unless the reader scrolled up, then offers a jump back.
 */
export function MeetingTranscript({
  chunks,
  heading = true,
  className = 'max-h-80',
  live = false,
}: {
  chunks: MeetAiChunk[];
  /** Off where a card title or tab already names the transcript. */
  heading?: boolean;
  /** Height limit of the scroll area. */
  className?: string;
  /** The transcript is being captured now. */
  live?: boolean;
}) {
  const t = useTranslations('meet.ai');
  const blocks = transcriptBlocks(chunks);
  const lines = blocks.reduce((sum, block) => sum + block.lines.length, 0);
  const scroller = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [seen, setSeen] = useState(lines);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !following || lines === 0) return;
    element.scrollTop = element.scrollHeight;
  }, [lines, following]);
  const unseen = !following && lines > seen;
  const removed = chunks.some(
    (chunk: MeetAiChunk) =>
      chunk.erased ||
      chunk.segments?.some((segment: object) => 'erased' in segment)
  );
  return (
    <section className="relative min-h-0" aria-label={t('transcript')}>
      {heading && (
        <h3 className="mb-2 font-medium text-sm">{t('transcript')}</h3>
      )}
      <div
        ref={scroller}
        className={`space-y-4 overflow-y-auto pr-1 ${className}`}
        aria-live={live ? 'polite' : undefined}
        onScroll={(event) => {
          const element = event.currentTarget;
          const atEnd =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            48;
          setFollowing(atEnd);
          if (atEnd) setSeen(lines);
        }}
      >
        {removed && (
          <p className="text-muted-foreground text-sm">{t('removed_banner')}</p>
        )}
        {!blocks.length && (
          <p className="py-6 text-center text-muted-foreground text-sm">
            {live ? t('transcript_listening') : t('empty')}
          </p>
        )}
        {blocks.map((block) => (
          <article key={block.key} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs"
            >
              {block.label ? block.label.slice(0, 1).toUpperCase() : '?'}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="break-words font-medium">
                  {block.label ?? t('speaker_unknown')}
                </span>
                {block.kind && (
                  <span className="text-muted-foreground text-xs">
                    {t(
                      block.kind === 'shared_audio'
                        ? 'speaker_shared_audio'
                        : 'speaker_microphone'
                    )}
                  </span>
                )}
              </p>
              {block.lines.map((line) => (
                <p key={line.key} className="flex gap-2 text-sm">
                  <time className="w-10 shrink-0 pt-0.5 text-muted-foreground text-xs tabular-nums">
                    {transcriptTime(line.startSeconds)}
                  </time>
                  <span
                    className={`min-w-0 flex-1 break-words ${
                      line.text ? '' : 'text-muted-foreground italic'
                    }`}
                  >
                    {line.status === 'processing' && !line.text && (
                      <Loader2
                        aria-hidden
                        className="mr-1 inline size-3 motion-safe:animate-spin"
                      />
                    )}
                    {line.text ||
                      t(
                        line.status === 'processing'
                          ? 'processing'
                          : line.status === 'failed'
                            ? 'missing'
                            : 'silence'
                      )}
                  </span>
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
      {unseen && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute bottom-2 left-1/2 -translate-x-1/2 shadow-sm"
          onClick={() => {
            setFollowing(true);
            setSeen(lines);
          }}
        >
          <ArrowDown aria-hidden className="size-4" />
          {t('transcript_jump')}
        </Button>
      )}
    </section>
  );
}
