'use client';

import { Quote } from '@tuturuuu/icons';
import type { MeetAiSession } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MeetingFollowups } from '@/features/meeting-ai/meeting-followups';
import { findQuoteLine, type TranscriptLine } from './transcript-lines';

export function MeetingNotesTab({
  wsId,
  meetingId,
  sessions,
  lines,
  onJump,
}: {
  wsId: string;
  meetingId: string;
  sessions: MeetAiSession[];
  lines: TranscriptLine[];
  onJump: (lineId: string) => void;
}) {
  const t = useTranslations('meet.notes_page');
  const withNotes = sessions.filter((session) => session.notes);
  if (!withNotes.length)
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        {t(
          sessions.some((session) => session.notes_status === 'processing')
            ? 'notes_processing'
            : 'notes_empty'
        )}
      </p>
    );

  return (
    <div className="space-y-8">
      {withNotes.map((session) => {
        const notes = session.notes;
        if (!notes) return null;
        const quotes = (notes.calendarSuggestions ?? [])
          .map((item) => item.evidence?.trim())
          .filter((value): value is string => Boolean(value));
        return (
          <article key={session.id} className="space-y-5">
            {withNotes.length > 1 ? (
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                {t('session', { number: sessions.indexOf(session) + 1 })}
              </h3>
            ) : null}
            {notes.incomplete ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm"
              >
                {t('partial')}
              </p>
            ) : null}
            <NotesSection title={t('summary')}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {notes.summary || t('none')}
              </p>
            </NotesSection>
            <NotesSection title={t('decisions')}>
              <NotesList items={notes.decisions} empty={t('none')} />
            </NotesSection>
            <NotesSection title={t('action_items')}>
              <NotesList
                empty={t('none')}
                items={notes.actionItems.map((item) =>
                  [
                    item.task,
                    item.owner ? `${t('owner')}: ${item.owner}` : null,
                    item.dueDate ? `${t('due')}: ${item.dueDate}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                )}
              />
            </NotesSection>
            <NotesSection title={t('open_questions')}>
              <NotesList items={notes.openQuestions} empty={t('none')} />
            </NotesSection>
            <MeetingFollowups
              session={session}
              meetingId={meetingId}
              wsId={wsId}
            />
            {quotes.length ? (
              <NotesSection title={t('evidence')}>
                <ul className="space-y-2">
                  {quotes.map((quote, index) => {
                    const line = findQuoteLine(lines, quote);
                    return (
                      <li
                        key={`${index}-${quote}`}
                        className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm"
                      >
                        <Quote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <blockquote className="min-w-0 flex-1 break-words italic">
                          {quote}
                        </blockquote>
                        {line ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onJump(line.id)}
                          >
                            {t('jump_to_transcript')}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {t('quote_not_found')}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </NotesSection>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function NotesSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="font-medium text-sm">{title}</h4>
      {children}
    </section>
  );
}

function NotesList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length)
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <ul className="list-outside list-disc space-y-1 pl-5 text-sm">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}
