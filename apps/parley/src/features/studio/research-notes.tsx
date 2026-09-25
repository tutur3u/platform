'use client';
import { MeetingLocalTime } from '@tuturuuu/meet-core/features/call/components/meeting-local-time';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { saveObservation } from './actions';

export function ResearchNotes({
  meetingId,
  notes,
  page,
  hasMore,
}: {
  meetingId: string;
  page: number;
  hasMore: boolean;
  notes: { id: string; kind: string; content: string; created_at: string }[];
}) {
  const t = useTranslations('parley');
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');
  const visible = notes.filter((n) => !filter || n.kind === filter);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <header>
        <h2 className="font-semibold text-lg">{t('notes')}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('private_notes_hint')}
        </p>
      </header>
      <form
        ref={form}
        className="space-y-3"
        action={(data) =>
          startTransition(async () => {
            try {
              await saveObservation(data);
              form.current?.reset();
              toast.success(t('note_saved'));
            } catch {
              toast.error(t('note_failed'));
            }
          })
        }
      >
        <input type="hidden" name="meeting_id" value={meetingId} />
        <label className="block space-y-2 text-sm">
          <span>{t('note_type')}</span>
          <select
            name="kind"
            className="h-10 w-full rounded-md border bg-background px-3"
          >
            {(['observation', 'decision', 'debrief'] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t(kind)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm">
          <span>{t('note_content')}</span>
          <Textarea
            name="content"
            required
            maxLength={8000}
            rows={5}
            placeholder={t('note_hint')}
          />
        </label>
        <Button disabled={pending} className="w-full">
          {t(pending ? 'saving_note' : 'save_note')}
        </Button>
      </form>
      <div className="border-t pt-4">
        <label className="block space-y-2 text-sm">
          <span>{t('filter_notes')}</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3"
          >
            <option value="">{t('all_notes')}</option>
            {(['observation', 'decision', 'debrief'] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t(kind)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-3">
        {!visible.length ? (
          <p className="py-4 text-muted-foreground text-sm">
            {t('notes_empty')}
          </p>
        ) : (
          visible.map((note) => (
            <article
              key={note.id}
              className="space-y-2 rounded-lg bg-muted/40 p-3"
            >
              <p className="font-medium text-xs">
                {t(note.kind as 'observation' | 'decision' | 'debrief')}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {note.content}
              </p>
              <p className="text-muted-foreground text-xs">
                <MeetingLocalTime value={note.created_at} pattern="PP p" />
              </p>
            </article>
          ))
        )}
      </div>
      <nav aria-label={t('pagination')} className="flex justify-between gap-3">
        {page > 0 ? (
          <Button asChild variant="outline">
            <Link href={`/sessions/${meetingId}?page=${page - 1}`}>
              {t('previous')}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {hasMore && (
          <Button asChild variant="outline">
            <Link href={`/sessions/${meetingId}?page=${page + 1}`}>
              {t('next')}
            </Link>
          </Button>
        )}
      </nav>
    </section>
  );
}
