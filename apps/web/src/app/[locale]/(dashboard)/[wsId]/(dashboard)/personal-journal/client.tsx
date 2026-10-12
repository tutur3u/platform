'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  type JournalEntry,
  type JournalPeriod,
  journalTimezoneSchema,
  listPersonalJournal,
} from '@tuturuuu/internal-api/personal-journal';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import JournalEditor from './editor';
import JournalTimeline from './timeline';
export default function JournalClient({
  actorId,
  wsId,
}: {
  actorId: string;
  wsId: string;
}) {
  const t = useTranslations('personal_journal');
  const queryClient = useQueryClient();
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [period, setPeriod] = useState<JournalPeriod>('day');
  const [selected, setSelected] = useState<JournalEntry>();
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const queryKey = ['personal-journal', actorId, wsId];
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      listPersonalJournal(wsId, pageParam || undefined),
    getNextPageParam: (page) => page.nextBefore ?? undefined,
    retry: false,
  });
  const items = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((entry) => [
        entry.id,
        entry,
      ])
    ).values(),
  ];
  const validZone = journalTimezoneSchema.safeParse(timezone).success;
  function select(entry?: JournalEntry) {
    if (busy) return;
    setSelected(entry);
    setEditorKey((value) => value + 1);
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="journal-view-timezone">{t('view_timezone')}</Label>
          <Input
            id="journal-view-timezone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            aria-invalid={!validZone}
          />
        </div>
        <div>
          <Label htmlFor="journal-period">{t('period')}</Label>
          <select
            id="journal-period"
            className="block rounded border bg-background p-2"
            value={period}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === 'day' ||
                value === 'week' ||
                value === 'month' ||
                value === 'year'
              )
                setPeriod(value);
            }}
          >
            {['day', 'week', 'month', 'year'].map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </div>
        <Button disabled={busy} onClick={() => select()}>
          {t('new_entry')}
        </Button>
      </div>
      {!validZone && <p role="alert">{t('invalid_timezone')}</p>}
      <JournalEditor
        key={editorKey}
        actorId={actorId}
        wsId={wsId}
        entry={selected}
        timezone={timezone}
        onBusy={setBusy}
        onSaved={() => void queryClient.invalidateQueries({ queryKey })}
      />
      <section aria-label={t('timeline')} className="space-y-4">
        <h2 className="font-semibold text-xl">{t('timeline')}</h2>
        {query.isPending && <output>{t('loading')}</output>}
        {query.isError && (
          <div role="alert">
            <p>{t('load_error')}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t('retry')}
            </Button>
          </div>
        )}
        {query.isSuccess && items.length === 0 && <p>{t('empty')}</p>}
        {validZone && (
          <JournalTimeline
            items={items}
            timezone={timezone}
            period={period}
            disabled={busy}
            onEdit={select}
          />
        )}
        {query.hasNextPage && (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('load_more')}
          </Button>
        )}
        {query.hasNextPage && (
          <p className="text-muted-foreground text-sm">{t('partial')}</p>
        )}
      </section>
    </main>
  );
}
