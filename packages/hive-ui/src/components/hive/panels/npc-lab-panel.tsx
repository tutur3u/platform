'use client';

import { Brain } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { HiveNpc, HiveWorldData } from '../../../engine/types';
import type { HiveAiContextState } from '../use-hive-ai-context';
import {
  createNpcDraft,
  type NpcDraft,
  type NpcLabInitialTab,
  NpcLabTabs,
} from './npc-lab-panel-tabs';

type NpcLabPanelProps = {
  aiContext: HiveAiContextState;
  initialTab?: NpcLabInitialTab;
  isRunning: boolean;
  lastRunLabel?: string | null;
  lastRunStatus?: 'completed' | 'failed' | 'running' | null;
  npcs: HiveNpc[];
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRun: (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced',
    options?: {
      maxTurns?: number;
      prompt?: string | null;
      targetNpcId?: string | null;
    }
  ) => void;
  onRunInteraction: (input: {
    maxTurns?: number;
    prompt?: string | null;
    sourceNpcId: string;
    targetNpcId: string;
  }) => void;
  revision: number;
  selectedNpc: HiveNpc | null;
  world: HiveWorldData;
};

export function NpcLabPanel({
  aiContext,
  initialTab = 'identity',
  isRunning,
  lastRunLabel,
  lastRunStatus,
  npcs,
  onPatchNpc,
  onRun,
  onRunInteraction,
  revision,
  selectedNpc,
  world,
}: NpcLabPanelProps) {
  const t = useTranslations('studio.npcLab');
  const npc = selectedNpc;
  const [draft, setDraft] = useState<NpcDraft | null>(
    npc ? createNpcDraft(npc) : null
  );
  const [targetNpcId, setTargetNpcId] = useState<string | null>(null);
  const [interactionPrompt, setInteractionPrompt] = useState('');
  const [interactionTurns, setInteractionTurns] = useState(4);

  useEffect(() => {
    setDraft(npc ? createNpcDraft(npc) : null);
    setTargetNpcId(null);
    setInteractionPrompt('');
  }, [npc]);

  const targetNpcs = useMemo(
    () => npcs.filter((item) => item.id !== npc?.id),
    [npc?.id, npcs]
  );

  useEffect(() => {
    setTargetNpcId((current) =>
      current && targetNpcs.some((target) => target.id === current)
        ? current
        : (targetNpcs[0]?.id ?? null)
    );
  }, [targetNpcs]);

  const runStatusLabel =
    lastRunLabel ?? (lastRunStatus ? t(`last_run_${lastRunStatus}`) : null);
  const hasChanges =
    npc && draft
      ? JSON.stringify(createNpcDraft(npc)) !== JSON.stringify(draft)
      : false;

  const patchSettings = (settingsPatch: HiveNpc['settings']) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            settings: {
              ...current.settings,
              ...settingsPatch,
            },
          }
        : current
    );
  };

  const saveDraft = () => {
    if (!npc || !draft) return;
    onPatchNpc(npc.id, draft);
  };

  return (
    <section className="pointer-events-auto w-[min(520px,42vw)] overflow-hidden rounded-lg border border-border/70 bg-background/92 text-foreground shadow-foreground/12 shadow-xl backdrop-blur-md">
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
      {!npc || !draft ? (
        <EmptyNpcLab npcsCount={npcs.length} />
      ) : (
        <div className="max-h-[64vh] overflow-y-auto p-4">
          {runStatusLabel ? (
            <div className="mb-3 rounded-md border border-dynamic-green/30 bg-dynamic-green/10 px-3 py-2 text-dynamic-green text-xs">
              {runStatusLabel}
            </div>
          ) : null}
          <NpcLabTabs
            aiContext={aiContext}
            draft={draft}
            hasChanges={hasChanges}
            initialTab={initialTab}
            interactionPrompt={interactionPrompt}
            interactionTurns={interactionTurns}
            isRunning={isRunning}
            npc={npc}
            onPatchSettings={patchSettings}
            onResetDraft={() => setDraft(createNpcDraft(npc))}
            onRun={onRun}
            onRunInteraction={onRunInteraction}
            onSaveDraft={saveDraft}
            setDraft={setDraft}
            setInteractionPrompt={setInteractionPrompt}
            setInteractionTurns={setInteractionTurns}
            setTargetNpcId={setTargetNpcId}
            targetNpcId={targetNpcId}
            targetNpcs={targetNpcs}
            world={world}
          />
        </div>
      )}
    </section>
  );
}

function EmptyNpcLab({ npcsCount }: { npcsCount: number }) {
  const t = useTranslations('studio.npcLab');

  return (
    <div className="space-y-2 p-4">
      <p className="font-medium text-sm">
        {npcsCount > 0 ? t('no_selection_title') : t('empty_title')}
      </p>
      <p className="text-muted-foreground text-sm leading-6">
        {npcsCount > 0 ? t('no_selection_body') : t('empty_body')}
      </p>
      {npcsCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          {t('available_npcs', { count: npcsCount })}
        </p>
      ) : null}
    </div>
  );
}
