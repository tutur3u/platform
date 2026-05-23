'use client';

import { Plus, Server } from '@tuturuuu/icons';
import type { HiveServer } from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

type HiveNoServerStateProps = {
  isAdmin: boolean;
  onCreateServer: () => void;
  onSelectServer: (serverId: string) => void;
  servers: HiveServer[];
};

export function HiveNoServerState({
  isAdmin,
  onCreateServer,
  onSelectServer,
  servers,
}: HiveNoServerStateProps) {
  const t = useTranslations('studio.server');

  return (
    <div
      className="flex h-full w-full items-start justify-center px-4"
      style={{ paddingTop: 'clamp(8rem, 32dvh, 18rem)' }}
    >
      <section className="w-full max-w-lg rounded-lg border border-border/70 bg-card/80 p-3 text-card-foreground shadow-2xl shadow-foreground/10 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-dynamic-green/50 bg-dynamic-green/10 text-dynamic-green">
            <Server className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-base text-foreground">
              {t('empty')}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm leading-5">
              {t('description_fallback')}
            </p>
          </div>
        </div>

        {servers.length ? (
          <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {servers.map((server) => (
              <button
                className="flex w-full items-center justify-between gap-3 rounded-md border border-border/70 bg-background/70 px-2.5 py-2 text-left transition hover:border-foreground/25 hover:bg-muted/60"
                key={server.id}
                onClick={() => onSelectServer(server.id)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">
                    {server.name}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {server.description || server.slug}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-sm border px-1.5 py-0.5 font-medium text-[10px]',
                    server.enabled
                      ? 'border-dynamic-green/40 text-dynamic-green'
                      : 'border-dynamic-yellow/40 text-dynamic-yellow'
                  )}
                >
                  {server.enabled ? t('enabled') : t('paused')}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {isAdmin ? (
          <Button
            className="mt-3 h-8 w-full gap-2 rounded-md"
            onClick={onCreateServer}
            size="sm"
            type="button"
          >
            <Plus className="h-4 w-4" />
            {t('create')}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
