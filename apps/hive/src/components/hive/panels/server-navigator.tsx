'use client';

import { Plus, Server, ShieldCheck } from '@tuturuuu/icons';
import type { HiveServer } from '@/engine/types';

type ServerNavigatorProps = {
  activeServerId: string | null;
  isAdmin: boolean;
  onCreateServer: () => void;
  onSelectServer: (id: string) => void;
  servers: HiveServer[];
};

export function ServerNavigator({
  activeServerId,
  isAdmin,
  onCreateServer,
  onSelectServer,
  servers,
}: ServerNavigatorProps) {
  return (
    <aside className="flex h-full min-w-64 flex-col border-zinc-800 border-r bg-zinc-950/96">
      <div className="border-zinc-800 border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm text-zinc-100">Hive</p>
            <p className="text-xs text-zinc-500">Shared voxel labs</p>
          </div>
          {isAdmin ? (
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              onClick={onCreateServer}
              title="Create server"
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {servers.map((server) => {
          const active = server.id === activeServerId;

          return (
            <button
              className={[
                'w-full rounded border p-3 text-left transition',
                active
                  ? 'border-emerald-400/70 bg-emerald-950/40 text-zinc-50'
                  : 'border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-700',
              ].join(' ')}
              key={server.id}
              onClick={() => onSelectServer(server.id)}
              type="button"
            >
              <span className="flex items-center gap-2">
                <Server className="h-4 w-4 text-emerald-300" />
                <span className="truncate font-medium text-sm">
                  {server.name}
                </span>
              </span>
              <span className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>{server.slug}</span>
                {server.enabled ? 'enabled' : 'paused'}
              </span>
            </button>
          );
        })}
      </div>
      {isAdmin ? (
        <div className="border-zinc-800 border-t p-3 text-xs text-zinc-500">
          <ShieldCheck className="mr-2 inline h-4 w-4 text-emerald-300" />
          Platform admin controls enabled
        </div>
      ) : null}
    </aside>
  );
}
