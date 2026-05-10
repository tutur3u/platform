'use client';

import { Bot, Box, SlidersHorizontal } from '@tuturuuu/icons';
import type { HiveNpc, HiveSelection, HiveWorldData } from '@/engine/types';
import { findSelectedEntity } from '@/engine/world';

type InspectorPanelProps = {
  npcs: HiveNpc[];
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  selection: HiveSelection;
  world: HiveWorldData;
};

export function InspectorPanel({
  npcs,
  onPatchNpc,
  selection,
  world,
}: InspectorPanelProps) {
  const entity = findSelectedEntity(world, npcs, selection);

  return (
    <aside className="flex h-full min-w-80 flex-col border-zinc-800 border-l bg-zinc-950/96">
      <div className="border-zinc-800 border-b p-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-emerald-300" />
          <p className="font-semibold text-sm text-zinc-100">Inspector</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!entity || !selection ? (
          <div className="rounded border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-500">
            Select a block, object, or NPC to inspect its research state.
          </div>
        ) : (
          <section className="rounded border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              {selection.kind === 'npc' ? (
                <Bot className="h-4 w-4 text-emerald-300" />
              ) : (
                <Box className="h-4 w-4 text-emerald-300" />
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
            </dl>
            {selection.kind === 'npc' && 'role' in entity ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-zinc-500">
                  Role
                  <input
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                    onChange={(event) =>
                      onPatchNpc(entity.id, { role: event.target.value })
                    }
                    value={entity.role}
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  Back story
                  <textarea
                    className="mt-1 min-h-24 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
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
