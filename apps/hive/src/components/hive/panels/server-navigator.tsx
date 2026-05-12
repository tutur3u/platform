'use client';

import {
  PanelLeftClose,
  Pencil,
  Plus,
  RefreshCcw,
  Server,
  ShieldCheck,
  Trash2,
} from '@tuturuuu/icons';
import type { HiveServer, HiveUser } from '@/engine/types';
import { HiveAccountMenu } from './hive-account-menu';

type ServerNavigatorProps = {
  activeServerId: string | null;
  currentUser: HiveUser;
  isAdmin: boolean;
  onCreateServer: () => void;
  onDeleteServer: (server: HiveServer) => void;
  onEditServer: (server: HiveServer) => void;
  onResetWorld: (mode: 'clear' | 'reseed') => void;
  onSelectServer: (id: string) => void;
  onToggle: () => void;
  servers: HiveServer[];
};

export function ServerNavigator({
  activeServerId,
  currentUser,
  isAdmin,
  onCreateServer,
  onDeleteServer,
  onEditServer,
  onResetWorld,
  onSelectServer,
  onToggle,
  servers,
}: ServerNavigatorProps) {
  const activeServer = servers.find((server) => server.id === activeServerId);

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-border border-r bg-[#101114] text-zinc-100">
      <div className="border-border/20 border-b p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-base text-zinc-100">Hive</p>
            <p className="text-sm text-zinc-400">Shared voxel labs</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/25 bg-white/5 text-zinc-100 transition hover:bg-white/10"
                onClick={onCreateServer}
                title="Create server"
                type="button"
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/25 bg-white/5 text-zinc-100 transition hover:bg-white/10"
              onClick={onToggle}
              title="Collapse servers"
              type="button"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {servers.length === 0 ? (
          <div className="rounded-lg border border-border/20 bg-white/5 p-4 text-sm text-zinc-400">
            No Hive servers are available.
          </div>
        ) : null}
        {servers.map((server) => {
          const active = server.id === activeServerId;

          return (
            <button
              className={[
                'w-full rounded border p-3 text-left transition',
                active
                  ? 'border-dynamic-green/80 bg-dynamic-green/15 text-zinc-50 shadow-dynamic-green/10 shadow-inner'
                  : 'border-border/20 bg-white/5 text-zinc-300 hover:border-border/40',
              ].join(' ')}
              key={server.id}
              onClick={() => onSelectServer(server.id)}
              type="button"
            >
              <span className="flex items-center gap-2">
                <Server className="h-4 w-4 text-dynamic-green" />
                <span className="truncate font-medium text-sm">
                  {server.name}
                </span>
              </span>
              <span className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span className="truncate">{server.slug}</span>
                {server.enabled ? 'enabled' : 'paused'}
              </span>
            </button>
          );
        })}
      </div>
      <div className="space-y-3 border-border/20 border-t p-4">
        {isAdmin ? (
          <>
            <div className="text-xs text-zinc-400">
              <ShieldCheck className="mr-2 inline h-4 w-4 text-dynamic-green" />
              Platform admin controls enabled
            </div>
            {activeServer ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border/20 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                  onClick={() => onEditServer(activeServer)}
                  type="button"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border/20 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                  onClick={() => onResetWorld('reseed')}
                  type="button"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Reseed
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border/20 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10"
                  onClick={() => onResetWorld('clear')}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs hover:bg-dynamic-red/15"
                  onClick={() => onDeleteServer(activeServer)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            ) : null}
          </>
        ) : null}
        <HiveAccountMenu user={currentUser} />
      </div>
    </aside>
  );
}
