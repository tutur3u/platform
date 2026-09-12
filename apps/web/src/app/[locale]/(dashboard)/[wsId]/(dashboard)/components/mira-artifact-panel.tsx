'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, RefreshCw, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { getMeetAppOrigin } from '@/lib/meet-app-url';
import { loadArtifactRows } from './mira-artifact-data';
import { MiraMeetingCreate } from './mira-meeting-create';
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
  const format = useFormatter();
  const locale = useLocale();
  const workspace = useMiraWorkspace();
  const { kind, wsId } = artifact;
  const query = useQuery({
    queryKey: ['mira-artifact', wsId, kind],
    queryFn: () => loadArtifactRows(kind, wsId),
    staleTime: 15_000,
  });
  const path = kind === 'finance' ? 'finance/wallets' : kind;
  const href = `${kind === 'meetings' ? getMeetAppOrigin() : ''}/${locale}/${encodeURIComponent(wsId)}/${path}`;
  return (
    <section
      aria-label={t(kind)}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2 className="truncate font-medium text-sm">{t(kind)}</h2>
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
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-muted-foreground text-xs">
          {t(`${kind}_description`)}
        </p>
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
        ) : query.data.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {t('empty')}
          </p>
        ) : (
          <ul className="divide-y">
            {query.data.map((row) => (
              <li key={row.id} className="py-3 first:pt-0">
                <p className="break-words font-medium text-sm">{row.title}</p>
                {row.date && (
                  <p className="mt-1 text-muted-foreground text-xs">
                    {format.dateTime(new Date(row.date), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
                {row.amount !== undefined && (
                  <p className="mt-1 text-sm tabular-nums">
                    {format.number(row.amount)} {row.currency}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {kind === 'meetings' && <MiraMeetingCreate wsId={wsId} />}
      </div>
    </section>
  );
}
