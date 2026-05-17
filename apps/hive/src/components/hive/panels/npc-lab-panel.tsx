'use client';

import { Brain, Play } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { HiveNpc, HiveWorldData } from '@/engine/types';

type NpcLabPanelProps = {
  isRunning: boolean;
  lastRunLabel?: string | null;
  lastRunStatus?: 'completed' | 'failed' | 'running' | null;
  npcs: HiveNpc[];
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRun: (npcId: string, promptMode: 'custom' | 'default' | 'enhanced') => void;
  revision: number;
  selectedNpc: HiveNpc | null;
  world: HiveWorldData;
};

const npcToggles = [
  { key: 'memoryEnabled', labelKey: 'memory' },
  { key: 'backstoryEnabled', labelKey: 'backstory' },
  { key: 'customPromptEnabled', labelKey: 'custom_prompt' },
] as const;

const agentModes = [
  { id: 'algorithmic', labelKey: 'mode_algorithmic' },
  { id: 'llm', labelKey: 'mode_llm' },
  { id: 'hybrid', labelKey: 'mode_hybrid' },
] as const;

export function NpcLabPanel({
  isRunning,
  lastRunLabel,
  lastRunStatus,
  npcs,
  onPatchNpc,
  onRun,
  revision,
  selectedNpc,
  world,
}: NpcLabPanelProps) {
  const t = useTranslations('studio.npcLab');
  const npc = selectedNpc;
  const settings = npc?.settings ?? {};
  const agentMode =
    typeof settings.agentMode === 'string' ? settings.agentMode : 'llm';
  const autonomous = Boolean(settings.autonomous);
  const runStatusLabel =
    lastRunLabel ?? (lastRunStatus ? t(`last_run_${lastRunStatus}`) : null);

  return (
    <section className="pointer-events-auto w-[min(420px,38vw)] overflow-hidden rounded-lg border border-border/70 bg-background/90 text-foreground shadow-foreground/12 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-border border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-dynamic-green" />
          <div>
            <p className="font-semibold text-sm">{t('title')}</p>
            {npc ? (
              <p className="text-[11px] text-muted-foreground">
                {t('selected_npc')}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {t('revision', { revision })}
        </p>
      </div>
      {!npc ? (
        <div className="space-y-2 p-4">
          <p className="font-medium text-sm">
            {npcs.length > 0 ? t('no_selection_title') : t('empty_title')}
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            {npcs.length > 0 ? t('no_selection_body') : t('empty_body')}
          </p>
          {npcs.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {t('available_npcs', { count: npcs.length })}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="max-h-[58vh] space-y-3 overflow-y-auto p-4">
          {runStatusLabel ? (
            <div className="rounded-md border border-dynamic-green/30 bg-dynamic-green/10 px-3 py-2 text-dynamic-green text-xs">
              {runStatusLabel}
            </div>
          ) : null}
          <label className="block text-muted-foreground text-xs">
            {t('name')}
            <input
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-foreground shadow-inner"
              onChange={(event) =>
                onPatchNpc(npc.id, { name: event.target.value })
              }
              value={npc.name}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {npcToggles.map(({ key, labelKey }) => (
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
                {t(labelKey)}
              </label>
            ))}
          </div>
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium text-xs">{t('decision_engine')}</p>
              <label className="flex items-center gap-2 text-muted-foreground text-xs">
                <input
                  checked={autonomous}
                  onChange={(event) =>
                    onPatchNpc(npc.id, {
                      settings: {
                        ...settings,
                        autonomous: event.target.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                {t('autonomous')}
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
                      settings: { ...settings, agentMode: mode.id },
                    })
                  }
                  type="button"
                >
                  {t(mode.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-muted-foreground text-xs">
            {t('system_prompt')}
            <textarea
              className="mt-1 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-foreground shadow-inner"
              onChange={(event) =>
                onPatchNpc(npc.id, { systemPrompt: event.target.value })
              }
              value={npc.systemPrompt}
            />
          </label>
          <label className="block text-muted-foreground text-xs">
            {t('model')}
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
                {t(`run_${mode}`)}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            {t('context', {
              blocks: world.blocks.length,
              objects: world.objects.length,
            })}
          </p>
        </div>
      )}
    </section>
  );
}
