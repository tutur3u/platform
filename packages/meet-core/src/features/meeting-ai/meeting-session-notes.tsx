'use client';

import type { MeetAiSession } from '@tuturuuu/internal-api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { MeetingFollowups } from './meeting-followups';

type Notes = NonNullable<MeetAiSession['notes']>;

/**
 * One session's post-call notes. `panel` keeps the in-call panel's full
 * outline; `ended` drops empty sections so a reader only sees content.
 */
function SessionNotesBody({
  session,
  notes,
  wsId,
  meetingId,
  variant,
}: {
  session: MeetAiSession;
  notes: Notes;
  wsId: string;
  meetingId: string;
  variant: 'panel' | 'ended';
}) {
  const t = useTranslations('meet.ai');
  const ended = variant === 'ended';
  const section = (
    title: string,
    items: Array<{ key: string; text: string }>
  ) => {
    const list = (
      <ul className={cn('list-inside list-disc', ended && 'leading-relaxed')}>
        {items.map((item) => (
          <li key={item.key}>{item.text}</li>
        ))}
      </ul>
    );
    if (!ended)
      return (
        <>
          <h4 className="font-medium">{title}</h4>
          {list}
        </>
      );
    return items.length ? (
      <div className="grid gap-1.5">
        <h4 className="font-medium text-sm">{title}</h4>
        {list}
      </div>
    ) : null;
  };
  return (
    <div className={cn('text-sm', ended ? 'grid gap-4' : 'space-y-2')}>
      {notes.incomplete ? (
        <p className="text-destructive">{t('partial')}</p>
      ) : null}
      <p
        className={cn(
          'whitespace-pre-wrap',
          ended && 'text-base leading-relaxed'
        )}
      >
        {notes.summary}
      </p>
      {section(
        t('decisions'),
        notes.decisions.map((value, index) => ({
          key: `${index}-${value}`,
          text: value,
        }))
      )}
      {section(
        t('actions'),
        notes.actionItems.map((item, index) => ({
          key: `${index}-${item.task}`,
          text: `${item.task}${item.owner ? ` — ${item.owner}` : ''}${
            item.dueDate ? ` (${item.dueDate})` : ''
          }`,
        }))
      )}
      <MeetingFollowups session={session} meetingId={meetingId} wsId={wsId} />
      {section(
        t('questions'),
        notes.openQuestions.map((value, index) => ({
          key: `${index}-${value}`,
          text: value,
        }))
      )}
    </div>
  );
}

/**
 * Post-call notes for every session that produced them. The ended page shows
 * a single session flat; several sessions, and the in-call panel, keep one
 * collapsible entry per session with the latest open.
 */
export function MeetingSessionNotes({
  sessions,
  wsId,
  meetingId,
  variant = 'panel',
}: {
  sessions: MeetAiSession[];
  wsId: string;
  meetingId: string;
  variant?: 'panel' | 'ended';
}) {
  const t = useTranslations('meet.ai');
  const withNotes = sessions.filter((session) => session.notes);
  const only = withNotes.length === 1 ? withNotes[0] : undefined;
  if (variant === 'ended' && only?.notes)
    return (
      <SessionNotesBody
        session={only}
        notes={only.notes}
        wsId={wsId}
        meetingId={meetingId}
        variant="ended"
      />
    );
  return (
    <Accordion
      key={withNotes.map((session) => session.id).join(':')}
      type="multiple"
      defaultValue={withNotes.slice(-1).map((session) => session.id)}
    >
      {sessions.map((session) =>
        session.notes ? (
          <AccordionItem key={session.id} value={session.id}>
            <AccordionTrigger>
              {t('session_notes', { number: sessions.indexOf(session) + 1 })}
            </AccordionTrigger>
            <AccordionContent>
              <SessionNotesBody
                session={session}
                notes={session.notes}
                wsId={wsId}
                meetingId={meetingId}
                variant={variant}
              />
            </AccordionContent>
          </AccordionItem>
        ) : null
      )}
    </Accordion>
  );
}
