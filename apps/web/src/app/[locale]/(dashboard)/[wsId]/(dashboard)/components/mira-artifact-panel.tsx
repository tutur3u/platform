'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, RefreshCw, Search, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { getMeetAppOrigin } from '@/lib/meet-app-url';
import { MiraArtifactContext } from './mira-artifact-context';
import { loadArtifactRows } from './mira-artifact-data';
import { artifactVisuals } from './mira-artifact-visuals';
import { MiraFinanceArtifact } from './mira-finance-artifact';
import { MiraMeetingCreate } from './mira-meeting-create';
import { MiraScheduleArtifact } from './mira-schedule-artifact';
import { MiraTaskArtifact } from './mira-task-artifact';
import {
  useMiraWorkspace,
  type WorkspaceArtifact,
} from './mira-workspace-state';

export function MiraArtifactPanel({
  artifact,
}: {
  artifact: WorkspaceArtifact;
}) {
  const t = useTranslations('dashboard.mira_workspace');
  const requestedSearch = artifact.presentation?.search ?? '';
  const [previousSearch, setPreviousSearch] = useState(requestedSearch);
  const [search, setSearch] = useState(requestedSearch);
  if (previousSearch !== requestedSearch) {
    setPreviousSearch(requestedSearch);
    setSearch(requestedSearch);
  }
  const locale = useLocale();
  const workspace = useMiraWorkspace();
  const { kind, wsId, presentation } = artifact;
  const visual = artifactVisuals[kind];
  const query = useQuery({
    queryKey: presentation?.date
      ? ['mira-artifact', wsId, kind, presentation.date]
      : ['mira-artifact', wsId, kind],
    queryFn: () => loadArtifactRows(kind, wsId, presentation?.date),
    staleTime: 15_000,
  });
  const rows = (query.data ?? [])
    .filter(
      (row) =>
        (!presentation?.currency || row.currency === presentation.currency) &&
        (!presentation?.itemIds?.length ||
          presentation.itemIds.includes(row.id))
    )
    .filter((row) =>
      `${row.title} ${row.detail ?? ''} ${row.currency ?? ''}`
        .toLocaleLowerCase(locale)
        .includes(search.trim().toLocaleLowerCase(locale))
    );
  const path = kind === 'finance' ? 'finance/wallets' : kind;
  const href = `${kind === 'meetings' ? getMeetAppOrigin() : ''}/${locale}/${encodeURIComponent(wsId)}/${path}`;
  return (
    <section
      aria-label={t(kind)}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card"
    >
      <header
        className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${visual.headerClass}`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${visual.iconClass}`}
          >
            <visual.icon aria-hidden className="size-3.5" />
          </div>
          <h2 className="truncate font-semibold text-sm">
            {presentation?.title ?? t(kind)}
          </h2>
          {query.data && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
              {rows.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t('refresh')}
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('refresh')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" className="size-7" asChild>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('open_full')}
                >
                  <ArrowUpRight className="size-3.5" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('open_full')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t('close')}
                onClick={() => workspace?.close(kind, wsId)}
              >
                <X className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('close')}</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-muted-foreground text-xs">
          {t(`${kind}_description`)}
        </p>
        <MiraArtifactContext presentation={presentation} kind={kind} />
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('search_items')}
            placeholder={t('search_items')}
            className="h-8 pl-8 text-xs"
          />
        </div>
        {query.isPending ? (
          <div role="status" aria-label={t('loading')} className="space-y-3">
            {[0, 1, 2].map((key) => (
              <div
                key={key}
                className="h-14 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : query.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-destructive text-sm">{t('load_failed')}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void query.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : query.data.length === 0 &&
          kind !== 'calendar' &&
          kind !== 'meetings' ? (
          <div className="rounded-lg border border-dashed px-3 py-5 text-center">
            <p className="text-muted-foreground text-xs">
              {t(kind === 'tasks' ? 'tasks_empty' : 'wallets_empty')}
            </p>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-medium text-xs underline underline-offset-4"
            >
              {t('open_full')}
            </a>
          </div>
        ) : rows.length === 0 && query.data.length > 0 ? (
          <p className="py-4 text-center text-muted-foreground text-xs">
            {t('no_matching_items')}
          </p>
        ) : kind === 'tasks' ? (
          <MiraTaskArtifact
            rows={rows}
            initialFilter={presentation?.taskStatus}
          />
        ) : kind === 'finance' ? (
          <MiraFinanceArtifact rows={rows} href={href} />
        ) : (
          <MiraScheduleArtifact
            rows={rows}
            meetings={kind === 'meetings'}
            startDate={presentation?.date}
            href={href}
          />
        )}
        {kind === 'meetings' && (
          <details className="rounded-lg border p-2.5">
            <summary className="cursor-pointer font-medium text-xs">
              {t('create_meeting')}
            </summary>
            <div className="mt-3">
              <MiraMeetingCreate wsId={wsId} />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
