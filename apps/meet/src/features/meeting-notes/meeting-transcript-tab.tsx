'use client';

import { Copy, Download, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef } from 'react';
import {
  filterTranscriptLines,
  formatTimestamp,
  type TranscriptLine,
  transcriptFileName,
  transcriptToMarkdown,
  transcriptToPlainText,
} from './transcript-lines';

export type TranscriptFocus = { lineId: string; nonce: number } | null;

export function MeetingTranscriptTab({
  title,
  lines,
  query,
  onQueryChange,
  focus,
}: {
  title: string;
  lines: TranscriptLine[];
  query: string;
  onQueryChange: (query: string) => void;
  focus: TranscriptFocus;
}) {
  const t = useTranslations('meet.notes_page');
  const container = useRef<HTMLOListElement>(null);
  const visible = useMemo(
    () => filterTranscriptLines(lines, query),
    [lines, query]
  );
  const hasText = lines.some((line) => line.text);

  useEffect(() => {
    if (!focus) return;
    const target = Array.from(
      container.current?.querySelectorAll<HTMLElement>('[data-line-id]') ?? []
    ).find((element) => element.dataset.lineId === focus.lineId);
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  }, [focus]);

  const copy = () => {
    void navigator.clipboard
      .writeText(transcriptToPlainText(lines, t('speaker_unknown')))
      .then(() => toast.success(t('copied')))
      .catch(() => toast.error(t('copy_failed')));
  };
  const exportMarkdown = () => {
    const blob = new Blob(
      [transcriptToMarkdown(title, lines, t('speaker_unknown'))],
      { type: 'text/markdown;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = transcriptFileName(title);
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!lines.length)
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        {t('transcript_empty')}
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t('search_label')}
            className="pl-9"
            placeholder={t('search_placeholder')}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <Button disabled={!hasText} variant="outline" onClick={copy}>
          <Copy className="mr-2 h-4 w-4" />
          {t('copy')}
        </Button>
        <Button disabled={!hasText} variant="outline" onClick={exportMarkdown}>
          <Download className="mr-2 h-4 w-4" />
          {t('export')}
        </Button>
      </div>
      {query.trim() ? (
        <output className="block text-muted-foreground text-xs">
          {t('search_results', { count: visible.length })}
        </output>
      ) : null}
      <ol
        ref={container}
        aria-label={t('tab_transcript')}
        className="max-h-[32rem] space-y-1 overflow-y-auto pr-1"
      >
        {visible.map((line) => (
          <li
            key={line.id}
            data-line-id={line.id}
            data-focused={focus?.lineId === line.id || undefined}
            tabIndex={-1}
            className={cn(
              'grid grid-cols-[4rem_1fr] gap-3 rounded-lg p-2 text-sm outline-none',
              focus?.lineId === line.id && 'bg-primary/10 ring-1 ring-primary'
            )}
          >
            <time className="pt-0.5 font-mono text-muted-foreground text-xs tabular-nums">
              {formatTimestamp(line.startSeconds)}
            </time>
            <div className="min-w-0">
              <p className="break-words font-medium">
                {line.speaker ?? t('speaker_unknown')}
                {line.kind === 'shared_audio' ? (
                  <span className="ml-2 font-normal text-muted-foreground text-xs">
                    {t('speaker_shared_audio')}
                  </span>
                ) : null}
              </p>
              <p
                className={cn(
                  'whitespace-pre-wrap break-words',
                  !line.text && 'text-muted-foreground italic'
                )}
              >
                {line.text || t(lineStatusKey(line.status))}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function lineStatusKey(status: string) {
  if (status === 'processing') return 'line_processing';
  if (status === 'failed') return 'line_missing';
  return 'line_silence';
}
