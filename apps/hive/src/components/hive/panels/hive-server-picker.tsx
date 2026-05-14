'use client';

import {
  Eraser,
  Info,
  Pencil,
  Plus,
  RefreshCcw,
  Server,
  ShieldCheck,
  Trash2,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@tuturuuu/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { HiveNpc, HiveServer, HiveWorldData } from '@/engine/types';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';

type HiveServerPickerProps = {
  activeServerId: string | null;
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
    <div className="flex min-w-0 items-center gap-1.5 border-border/60 border-r pr-2">
      <Select
        disabled={servers.length === 0}
        onValueChange={onSelectServer}
        value={activeServerId ?? undefined}
      >
        <SelectTrigger
          aria-label={t('select_label')}
          className="h-10 w-[min(190px,36vw)] rounded-md border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-dynamic-green text-background">
              <Server className="h-4 w-4" />
            </span>
            <span className="truncate">{server?.name ?? t('empty')}</span>
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="min-w-64">
          {servers.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <span className="min-w-0">
                <span className="block truncate">{item.name}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {item.slug} / {item.enabled ? t('enabled') : t('paused')}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label={t('info')}
                className="h-9 w-9 rounded-md border-border/60 bg-background/70"
                size="icon"
                type="button"
                variant="outline"
              >
                <Info className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">{t('info')}</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-80 rounded-2xl p-4">
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
            <div className="grid grid-cols-2 gap-2 text-xs">
              <ServerMetric label={t('blocks')} value={world.blocks.length} />
              <ServerMetric label={t('objects')} value={world.objects.length} />
              <ServerMetric label={t('npcs')} value={npcs.length} />
              <ServerMetric label={t('online')} value={presenceCount} />
              <ServerMetric label={t('revision')} value={revision} />
              <ServerMetric
                label={t('credits')}
                value={server?.totalCurrency ?? 0}
              />
            </div>
            {isAdmin ? (
              <div className="space-y-2 border-border border-t pt-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-dynamic-green" />
                  {t('admin')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={onCreateServer} size="sm" variant="outline">
                    <Plus className="h-3.5 w-3.5" />
                    {t('create')}
                  </Button>
                  <Button
                    disabled={!server}
                    onClick={() => server && onEditServer(server)}
                    size="sm"
                    variant="outline"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('edit')}
                  </Button>
                  <Button
                    disabled={!server}
                    onClick={() => onResetWorld('reseed')}
                    size="sm"
                    variant="outline"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    {t('reseed')}
                  </Button>
                  <Button
                    disabled={!server}
                    onClick={() => onResetWorld('clear')}
                    size="sm"
                    variant="outline"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    {t('clear')}
                  </Button>
                  <Button
                    disabled={!server}
                    onClick={() => server && onDeleteServer(server)}
                    size="sm"
                    variant="outline"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-dynamic-red" />
                    {t('delete')}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ServerMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/35 px-2.5 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
