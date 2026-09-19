'use client';

import { StickyNote } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useId, useState } from 'react';

export interface ContactNoteLabels {
  note: string;
  expand: string;
  collapse: string;
}

export function ContactNote({
  note,
  labels,
}: {
  note?: string | null;
  labels: ContactNoteLabels;
}) {
  const content = note?.trim();
  if (!content) return null;
  return <NoteContent key={content} content={content} labels={labels} />;
}

function NoteContent({
  content,
  labels,
}: {
  content: string;
  labels: ContactNoteLabels;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const canExpand = content.length > 160 || content.split('\n').length > 3;

  return (
    <div className="mt-2 min-w-0 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-xs">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
        <StickyNote className="size-3.5 shrink-0" aria-hidden="true" />
        {labels.note}
      </div>
      <p
        id={id}
        className={cn(
          'whitespace-pre-wrap text-foreground/80 leading-relaxed [overflow-wrap:anywhere]',
          canExpand && !expanded && 'line-clamp-3'
        )}
      >
        {content}
      </p>
      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-1.5 min-h-8 rounded-sm px-1 font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? labels.collapse : labels.expand}
        </button>
      )}
    </div>
  );
}
