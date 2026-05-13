'use client';

import { Bot, Box, Trash2 } from '@tuturuuu/icons';
import { getObjectCatalogItem, getTerrainHeight } from '@/engine/catalog';
import type {
  HiveNpc,
  HiveRealtimeAwareness,
  HiveSelection,
  HiveWorldData,
} from '@/engine/types';
import { findSelectedEntity } from '@/engine/world';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';
import { InspectorHeader } from './inspector-header';
import { InspectorObservabilityCard } from './inspector-observability-card';

type InspectorPanelProps = {
  npcs: HiveNpc[];
  eventsCount: number;
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRequestDelete: (selection: NonNullable<HiveSelection>) => void;
  onToggle: () => void;
  presenceCount: number;
  remoteAwareness: HiveRealtimeAwareness[];
  realtimeStatus: HiveRealtimeStatus;
  revision: number;
  selection: HiveSelection;
  world: HiveWorldData;
};

export function InspectorPanel({
  npcs,
  eventsCount,
  onPatchNpc,
  onRequestDelete,
  onToggle,
  presenceCount,
  remoteAwareness,
  realtimeStatus,
  revision,
  selection,
  world,
}: InspectorPanelProps) {
  const entity = findSelectedEntity(world, npcs, selection);
  const tileObjects =
    selection?.kind === 'block' && entity
      ? world.objects.filter(
          (object) =>
            object.position.x === entity.position.x &&
            object.position.z === entity.position.z
        )
      : [];
  const objectCatalogItem =
    entity && 'type' in entity ? getObjectCatalogItem(entity.type) : null;

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-border border-l bg-[#101114] text-zinc-100">
      <InspectorHeader onToggle={onToggle} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <InspectorObservabilityCard
          eventsCount={eventsCount}
          presenceCount={presenceCount}
          realtimeStatus={realtimeStatus}
          revision={revision}
        />
        {remoteAwareness.length > 0 ? (
          <section className="rounded-lg border border-border/20 bg-white/5 p-4">
            <p className="font-medium text-sm text-zinc-200">
              Researchers online
            </p>
            <div className="mt-3 space-y-2">
              {remoteAwareness.map((user) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border border-border/15 bg-black/15 px-3 py-2"
                  key={user.userId}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: user.color }}
                    />
                    <span className="truncate text-xs text-zinc-200">
                      {user.displayName}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {user.activeTool ?? 'viewing'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {!entity || !selection ? (
          <div className="rounded-lg border border-border/20 bg-white/5 p-4 text-sm text-zinc-400 leading-6">
            Select a block, object, or NPC to inspect its research state.
          </div>
        ) : (
          <section className="rounded-lg border border-border/20 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              {selection.kind === 'npc' ? (
                <Bot className="h-4 w-4 text-dynamic-green" />
              ) : (
                <Box className="h-4 w-4 text-dynamic-green" />
              )}
              <span className="font-medium">{selection.kind}</span>
            </div>
            <dl className="mt-4 space-y-3 text-xs">
              <div>
                <dt className="text-zinc-500">ID</dt>
                <dd className="break-all text-zinc-300">{entity.id}</dd>
              </div>
              {'type' in entity ? (
                <div>
                  <dt className="text-zinc-500">Type</dt>
                  <dd className="text-zinc-300">{entity.type}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-zinc-500">Position</dt>
                <dd className="text-zinc-300">
                  {entity.position.x}, {entity.position.y}, {entity.position.z}
                </dd>
              </div>
              {selection.kind === 'block' && 'type' in entity ? (
                <>
                  <div>
                    <dt className="text-zinc-500">Surface height</dt>
                    <dd className="text-zinc-300">
                      {getTerrainHeight(entity.type).toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Tile objects</dt>
                    <dd className="text-zinc-300">
                      {tileObjects.length
                        ? tileObjects.map((object) => object.type).join(', ')
                        : 'empty'}
                    </dd>
                  </div>
                </>
              ) : null}
              {selection.kind === 'object' && objectCatalogItem ? (
                <>
                  <div>
                    <dt className="text-zinc-500">Category</dt>
                    <dd className="text-zinc-300">
                      {objectCatalogItem.category}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Rotation</dt>
                    <dd className="text-zinc-300">
                      {'rotation' in entity ? (entity.rotation ?? 0) : 0} deg
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Placement rule</dt>
                    <dd className="text-zinc-300">
                      {objectCatalogItem.description ?? 'Single object tile'}
                    </dd>
                  </div>
                  {'state' in entity && entity.state ? (
                    <div>
                      <dt className="text-zinc-500">State</dt>
                      <dd className="break-all text-zinc-300">
                        {Object.entries(entity.state)
                          .map(([key, value]) => `${key}: ${String(value)}`)
                          .join(' / ')}
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : null}
              {selection.kind === 'npc' && 'model' in entity ? (
                <>
                  <div>
                    <dt className="text-zinc-500">Model</dt>
                    <dd className="break-all text-zinc-300">{entity.model}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Research toggles</dt>
                    <dd className="text-zinc-300">
                      {entity.memoryEnabled ? 'memory on' : 'memory off'} /{' '}
                      {entity.backstoryEnabled
                        ? 'backstory on'
                        : 'backstory off'}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs hover:bg-dynamic-red/15"
              onClick={() => {
                if (selection) onRequestDelete(selection);
              }}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete selected
            </button>
            {selection.kind === 'npc' && 'role' in entity ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-zinc-500">
                  Role
                  <input
                    className="mt-1 w-full rounded-md border border-border/20 bg-black/20 px-3 py-2 text-zinc-100"
                    onChange={(event) =>
                      onPatchNpc(entity.id, { role: event.target.value })
                    }
                    value={entity.role}
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  Back story
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-md border border-border/20 bg-black/20 px-3 py-2 text-zinc-100"
                    onChange={(event) =>
                      onPatchNpc(entity.id, { backstory: event.target.value })
                    }
                    value={entity.backstory}
                  />
                </label>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </aside>
  );
}
