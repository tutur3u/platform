import Image from 'next/image';
import { formatSimulatedClock, timeThemeLabels } from '@/engine/time-themes';
import type {
  HiveNpc,
  HiveRealtimeAwareness,
  HiveServer,
  HiveTimeTheme,
  HiveWorldData,
} from '@/engine/types';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';

export function ServerSummary({
  autoTimeEnabled,
  npcs,
  presenceCount,
  remoteAwareness,
  realtimeStatus,
  server,
  simulatedMinutes,
  timeTheme,
  world,
}: {
  autoTimeEnabled: boolean;
  npcs: HiveNpc[];
  presenceCount: number;
  remoteAwareness: HiveRealtimeAwareness[];
  realtimeStatus: HiveRealtimeStatus;
  server?: HiveServer | null;
  simulatedMinutes: number;
  timeTheme: HiveTimeTheme;
  world: HiveWorldData;
}) {
  const connected = realtimeStatus === 'connected';

  return (
    <div className="pointer-events-auto rounded-lg border border-border/70 bg-background/88 px-4 py-3 text-foreground shadow-foreground/10 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold text-sm">
          {server?.name ?? 'No server selected'}
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
          {connected ? 'Realtime' : realtimeStatus}
        </span>
      </div>
      <p className="mt-1 text-muted-foreground text-xs">
        {world.blocks.length} blocks / {world.objects.length} objects /{' '}
        {npcs.length} NPCs / {presenceCount} online
      </p>
      {typeof server?.totalCurrency === 'number' ? (
        <p className="mt-1 text-dynamic-green text-xs">
          {server.totalCurrency.toLocaleString()} server credits tracked
        </p>
      ) : null}
      {remoteAwareness.length > 0 ? (
        <div className="mt-3 flex items-center gap-1.5">
          {remoteAwareness.slice(0, 6).map((user) => (
            <div
              className="grid h-7 w-7 place-items-center rounded-full border border-background font-semibold text-[10px] text-white shadow-sm"
              key={user.userId}
              style={{ backgroundColor: user.color }}
              title={`${user.displayName} - ${user.activeTool ?? 'watching'}`}
            >
              {user.avatarUrl ? (
                <Image
                  alt={user.displayName}
                  className="h-full w-full rounded-full object-cover"
                  height={28}
                  src={user.avatarUrl}
                  unoptimized
                  width={28}
                />
              ) : (
                user.displayName.slice(0, 2).toUpperCase()
              )}
            </div>
          ))}
          {remoteAwareness.length > 6 ? (
            <span className="text-muted-foreground text-xs">
              +{remoteAwareness.length - 6}
            </span>
          ) : null}
        </div>
      ) : null}
      {autoTimeEnabled ? (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="rounded-md border border-border bg-muted/60 px-2 py-1 font-mono text-foreground">
            {formatSimulatedClock(simulatedMinutes)}
          </span>
          <span className="text-muted-foreground">
            Auto 24h - {timeThemeLabels[timeTheme]}
          </span>
        </div>
      ) : null}
    </div>
  );
}
