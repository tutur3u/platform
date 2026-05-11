'use client';

import { Brain, Play } from '@tuturuuu/icons';
import type { HiveNpc, HiveWorldData } from '@/engine/types';

type NpcLabPanelProps = {
  isRunning: boolean;
  npcs: HiveNpc[];
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRun: (npcId: string, promptMode: 'custom' | 'default' | 'enhanced') => void;
  revision: number;
  world: HiveWorldData;
};

const npcToggles = [
  { key: 'memoryEnabled', label: 'Memory' },
  { key: 'backstoryEnabled', label: 'Backstory' },
  { key: 'customPromptEnabled', label: 'Custom' },
] as const;

export function NpcLabPanel({
  isRunning,
  npcs,
  onPatchNpc,
  onRun,
  revision,
  world,
}: NpcLabPanelProps) {
  const npc = npcs[0] ?? null;

  return (
    <section className="pointer-events-auto w-[min(440px,42vw)] overflow-hidden rounded-lg border border-zinc-200/80 bg-white/88 text-zinc-900 shadow-xl shadow-zinc-900/12 backdrop-blur-md">
      <div className="flex items-center justify-between border-zinc-200 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-emerald-600" />
          <p className="font-semibold text-sm">NPC Lab</p>
        </div>
        <p className="text-xs text-zinc-500">rev {revision}</p>
      </div>
      {!npc ? (
        <div className="p-4 text-sm text-zinc-500 leading-6">
          Place an NPC to configure prompts, memory, and manual decision runs.
        </div>
      ) : (
        <div className="max-h-[58vh] space-y-3 overflow-y-auto p-4">
          <label className="block text-xs text-zinc-500">
            Name
            <input
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-zinc-900 shadow-inner shadow-zinc-200/40"
              onChange={(event) =>
                onPatchNpc(npc.id, { name: event.target.value })
              }
              value={npc.name}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {npcToggles.map(({ key, label }) => (
              <label
                className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600"
                key={key}
              >
                <input
                  checked={npc[key]}
                  className="mr-2"
                  onChange={(event) =>
                    onPatchNpc(npc.id, { [key]: event.target.checked })
                  }
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
          <label className="block text-xs text-zinc-500">
            System prompt
            <textarea
              className="mt-1 min-h-28 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-zinc-900 shadow-inner shadow-zinc-200/40"
              onChange={(event) =>
                onPatchNpc(npc.id, { systemPrompt: event.target.value })
              }
              value={npc.systemPrompt}
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Model
            <input
              className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-zinc-900 shadow-inner shadow-zinc-200/40"
              onChange={(event) =>
                onPatchNpc(npc.id, { model: event.target.value })
              }
              value={npc.model}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['default', 'enhanced', 'custom'] as const).map((mode) => (
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-emerald-800 text-xs disabled:opacity-50"
                disabled={isRunning}
                key={mode}
                onClick={() => onRun(npc.id, mode)}
                type="button"
              >
                <Play className="h-3.5 w-3.5" />
                {mode}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            Context: {world.blocks.length} blocks and {world.objects.length}{' '}
            objects.
          </p>
        </div>
      )}
    </section>
  );
}
