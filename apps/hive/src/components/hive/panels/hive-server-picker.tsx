'use client';

import { Info } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type {
  HiveBuildInfo,
  HiveNpc,
  HiveServer,
  HiveWorldData,
} from '@/engine/types';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';
import { HiveServerAdminControls } from './hive-server-admin-controls';
import { HiveServerBuildInfo } from './hive-server-build-info';
import { HiveServerSelect } from './hive-server-select';
import { HiveServerStats } from './hive-server-stats';

type HiveServerPickerProps = {
  activeServerId: string | null;
  buildInfo: HiveBuildInfo;
  isAdmin: boolean;
  npcs: HiveNpc[];
  onCreateServer: () => void;
  onDeleteServer: (server: HiveServer) => void;
  onEditServer: (server: HiveServer) => void;
  onResetWorld: (mode: 'clear' | 'reseed') => void;
  onSelectServer: (id: string) => void;
  presenceCount: number;
  realtimeStatus: HiveRealtimeStatus;
  revision: number;
  server?: HiveServer | null;
  servers: HiveServer[];
  world: HiveWorldData;
};

export function HiveServerPicker({
  activeServerId,
  buildInfo,
  isAdmin,
  npcs,
  onCreateServer,
  onDeleteServer,
  onEditServer,
  onResetWorld,
  onSelectServer,
  presenceCount,
  realtimeStatus,
  revision,
  server,
  servers,
  world,
}: HiveServerPickerProps) {
  const t = useTranslations('studio.server');
  const connected = realtimeStatus === 'connected';

  return (
    <div className="flex min-w-0 items-center gap-1">
      <HiveServerSelect
        activeServerId={activeServerId}
        labels={{
          empty: t('empty'),
          enabled: t('enabled'),
          paused: t('paused'),
          select: t('select_label'),
        }}
        onSelectServer={onSelectServer}
        server={server}
        servers={servers}
      />
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={t('info')}
                className="h-9 w-9 rounded-md border-border/60 bg-background/70 transition-transform duration-200 ease-out hover:-translate-y-0.5"
                size="icon"
                type="button"
                variant="outline"
              >
                <Info className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('info')}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1 w-80 rounded-2xl p-4"
        >
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-sm">
                  {server?.name ?? t('empty')}
                </p>
                <span
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium text-[11px]',
                    connected
                      ? 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green'
                      : 'border-dynamic-yellow/40 bg-dynamic-yellow/10 text-dynamic-yellow',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'h-1.5 w-1.5 rounded-full',
                      connected ? 'bg-dynamic-green' : 'bg-dynamic-yellow',
                    ].join(' ')}
                  />
                  {connected ? t('realtime') : realtimeStatus}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {server?.description || t('description_fallback')}
              </p>
            </div>
            <HiveServerStats
              labels={{
                blocks: t('blocks'),
                credits: t('credits'),
                npcs: t('npcs'),
                objects: t('objects'),
                online: t('online'),
                revision: t('revision'),
              }}
              npcs={npcs}
              presenceCount={presenceCount}
              revision={revision}
              server={server}
              world={world}
            />
            {isAdmin ? (
              <HiveServerAdminControls
                labels={{
                  admin: t('admin'),
                  clear: t('clear'),
                  create: t('create'),
                  delete: t('delete'),
                  edit: t('edit'),
                  reseed: t('reseed'),
                }}
                onCreateServer={onCreateServer}
                onDeleteServer={onDeleteServer}
                onEditServer={onEditServer}
                onResetWorld={onResetWorld}
                server={server}
              />
            ) : null}
            <HiveServerBuildInfo
              buildInfo={buildInfo}
              labels={{
                commit: t('commit'),
                commitMessage: t('commit_message'),
                unknown: t('unknown'),
                version: t('version'),
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
