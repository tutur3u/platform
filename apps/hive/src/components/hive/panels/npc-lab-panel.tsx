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

const agentModes = [
  { id: 'algorithmic', label: 'Algorithmic' },
  { id: 'llm', label: 'LLM' },
  { id: 'hybrid', label: 'Hybrid' },
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
  const agentMode =
    npc && typeof npc.settings.agentMode === 'string'
      ? npc.settings.agentMode
      : 'llm';
  const autonomous = Boolean(npc?.settings.autonomous);

  return (
    <section className="pointer-events-auto w-[min(420px,38vw)] overflow-hidden rounded-lg border border-border/70 bg-background/90 text-foreground shadow-foreground/12 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-border border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-dynamic-green" />
          <p className="font-semibold text-sm">NPC Lab</p>
        </div>
        <p className="text-muted-foreground text-xs">rev {revision}</p>
      </div>
      {!npc ? (
        <div className="p-4 text-muted-foreground text-sm leading-6">
          Place an NPC to configure prompts, memory, and manual decision runs.
        </div>
      ) : (
        <div className="max-h-[58vh] space-y-3 overflow-y-auto p-4">
          <label className="block text-muted-foreground text-xs">
            Name
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-foreground shadow-inner"
              onChange={(event) =>
                onPatchNpc(npc.id, { name: event.target.value })
              }
              value={npc.name}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {npcToggles.map(({ key, label }) => (
              <label
                className="rounded-md border bg-muted/40 p-2 text-muted-foreground text-xs"
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
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium text-xs">Decision engine</p>
              <label className="flex items-center gap-2 text-muted-foreground text-xs">
                <input
                  checked={autonomous}
                  onChange={(event) =>
                    onPatchNpc(npc.id, {
                      settings: {
                        ...npc.settings,
                        autonomous: event.target.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Autonomous
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {agentModes.map((mode) => (
                <button
                  className={[
                    'rounded-md border px-2 py-2 text-xs transition',
                    agentMode === mode.id
                      ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                  key={mode.id}
                  onClick={() =>
                    onPatchNpc(npc.id, {
                      settings: { ...npc.settings, agentMode: mode.id },
                    })
                  }
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-muted-foreground text-xs">
            System prompt
            <textarea
              className="mt-1 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-foreground shadow-inner"
              onChange={(event) =>
                onPatchNpc(npc.id, { systemPrompt: event.target.value })
              }
              value={npc.systemPrompt}
            />
          </label>
          <label className="block text-muted-foreground text-xs">
            Model
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-foreground shadow-inner"
              onChange={(event) =>
                onPatchNpc(npc.id, { model: event.target.value })
              }
              value={npc.model}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['default', 'enhanced', 'custom'] as const).map((mode) => (
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-dynamic-green/30 bg-dynamic-green/10 px-2 py-2 text-dynamic-green text-xs disabled:opacity-50"
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
          <p className="text-muted-foreground text-xs">
            Context: {world.blocks.length} blocks and {world.objects.length}{' '}
            objects.
          </p>
        </div>
      )}
    </section>
  );
}
