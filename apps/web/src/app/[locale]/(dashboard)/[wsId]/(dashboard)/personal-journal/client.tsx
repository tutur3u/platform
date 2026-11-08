'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  type JournalEntry,
  type JournalExport,
  type JournalPeriod,
  journalExportFilename,
  journalExportPayload,
  journalMoodSeries,
  journalTimezoneSchema,
  listPersonalJournal,
} from '@tuturuuu/internal-api/personal-journal';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import JournalEditor from './editor';
import JournalMoodChart from './mood-chart';
import JournalTimeline from './timeline';

function saveJournalExport(payload: JournalExport) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = journalExportFilename(payload.exportedAt);
  link.click();
  URL.revokeObjectURL(url);
}

export default function JournalClient({
  actorId,
  moodTracking,
  wsId,
}: {
  actorId: string;
  moodTracking: boolean;
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
  const [exportState, setExportState] = useState<
    'idle' | 'working' | 'failed' | 'partial'
  >('idle');
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
  async function exportJournal() {
    setExportState('working');
    try {
      let page = query.data;
      let hasMore = Boolean(query.hasNextPage);
      let steps = 0;
      while (hasMore && steps < 100) {
        const next = await query.fetchNextPage();
        if (next.isError || !next.data) {
          setExportState('failed');
          return;
        }
        page = next.data;
        hasMore = Boolean(next.hasNextPage);
        steps += 1;
      }
      const loaded = [
        ...new Map(
          (page?.pages.flatMap((item) => item.items) ?? []).map((entry) => [
            entry.id,
            entry,
          ])
        ).values(),
      ];
      const payload = journalExportPayload(loaded, {
        complete: !hasMore,
        exportedAt: new Date().toISOString(),
      });
      saveJournalExport(payload);
      setExportState(hasMore ? 'partial' : 'idle');
    } catch {
      setExportState('failed');
    }
  }
  const moodPoints =
    moodTracking && validZone ? journalMoodSeries(items, timezone, period) : [];
  return (
    <main className="mx-auto min-w-0 max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="min-w-0">
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <p className="break-words text-muted-foreground">{t('description')}</p>
      </header>
      <div className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,16rem)_auto_auto]">
        <div className="min-w-0">
          <Label htmlFor="journal-view-timezone">{t('view_timezone')}</Label>
          <Input
            id="journal-view-timezone"
            className="w-full"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            aria-invalid={!validZone}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="journal-period">{t('period')}</Label>
          <select
            id="journal-period"
            className="block w-full min-w-0 rounded border bg-background p-2 sm:w-auto"
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
            {(['day', 'week', 'month', 'year'] satisfies JournalPeriod[]).map(
              (value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              )
            )}
          </select>
        </div>
        <Button
          className="w-full sm:w-auto"
          disabled={busy}
          onClick={() => select()}
        >
          {t('new_entry')}
        </Button>
      </div>
      {!validZone && <p role="alert">{t('invalid_timezone')}</p>}
      {moodTracking && (
        <section aria-label={t('mood_chart')} className="min-w-0 space-y-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="font-semibold text-xl">{t('mood_chart')}</h2>
              <Badge variant="outline">{t('experimental')}</Badge>
            </div>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              disabled={
                busy ||
                exportState === 'working' ||
                query.isPending ||
                query.isError ||
                items.length === 0
              }
              onClick={() => void exportJournal()}
            >
              {t('export_journal')}
            </Button>
          </div>
          {exportState === 'failed' && <p role="alert">{t('export_failed')}</p>}
          {exportState === 'partial' && <p>{t('export_partial')}</p>}
          {validZone && (
            <JournalMoodChart
              points={moodPoints}
              emptyLabel={t('mood_chart_empty')}
              averageLabel={t('mood_average')}
              countLabel={t('mood_count')}
            />
          )}
        </section>
      )}
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
