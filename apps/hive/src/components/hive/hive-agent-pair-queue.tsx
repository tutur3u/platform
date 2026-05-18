'use client';

import { Play } from '@tuturuuu/icons';
import type { HivePairQueueResponse } from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { HiveNpc, HiveWorldData } from '@/engine/types';
import { useHiveResearchMutations } from '@/hooks/use-hive-data';
import { RunTracePanel } from './run-trace-panel';
import type { HiveAiContextState } from './use-hive-ai-context';

type PairMode = 'all_to_all' | 'custom' | 'round_robin';

type HiveAgentPairQueueProps = {
  activeSessionId: string | null;
  aiContext: HiveAiContextState;
  npcs: HiveNpc[];
  revision: number;
  selectedIds: string[];
  serverId: string | null;
  world: HiveWorldData;
};

function createPairs(input: {
  customTargetId: string | null;
  mode: PairMode;
  npcs: HiveNpc[];
  selectedIds: string[];
}) {
  const selected = input.npcs.filter((npc) =>
    input.selectedIds.includes(npc.id)
  );

  if (input.mode === 'custom' && input.customTargetId) {
    return selected
      .filter((npc) => npc.id !== input.customTargetId)
      .map((npc) => ({
        sourceNpcId: npc.id,
        targetNpcId: input.customTargetId!,
      }));
  }

  if (input.mode === 'round_robin') {
    return selected
      .map((npc, index) => {
        const target = selected[(index + 1) % selected.length];
        return target && target.id !== npc.id
          ? { sourceNpcId: npc.id, targetNpcId: target.id }
          : null;
      })
      .filter((pair): pair is { sourceNpcId: string; targetNpcId: string } =>
        Boolean(pair)
      );
  }

  return selected.flatMap((source) =>
    selected
      .filter((target) => target.id !== source.id)
      .map((target) => ({
        sourceNpcId: source.id,
        targetNpcId: target.id,
      }))
  );
}

export function HiveAgentPairQueue({
  activeSessionId,
  aiContext,
  npcs,
  revision,
  selectedIds,
  serverId,
  world,
}: HiveAgentPairQueueProps) {
  const t = useTranslations('studio.agents');
  const [pairMode, setPairMode] = useState<PairMode>('round_robin');
  const [customTargetId, setCustomTargetId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [turns, setTurns] = useState(4);
  const [lastQueue, setLastQueue] = useState<HivePairQueueResponse | null>(
    null
  );
  const mutations = useHiveResearchMutations(serverId);
  const pairs = useMemo(
    () =>
      createPairs({
        customTargetId,
        mode: pairMode,
        npcs,
        selectedIds,
      }),
    [customTargetId, pairMode, npcs, selectedIds]
  );

  const runQueue = () => {
    if (!serverId || !activeSessionId || pairs.length === 0) return;
    mutations.runPairQueue.mutate(
      {
        payload: {
          creditSource: aiContext.aiRunContext?.creditSource,
          creditWsId: aiContext.aiRunContext?.creditWsId,
          expectedRevision: revision,
          maxTurns: turns,
          model: aiContext.aiRunContext?.model,
          pairs,
          prompt: prompt.trim() || null,
          world,
        },
        sessionId: activeSessionId,
      },
      { onSuccess: (result) => setLastQueue(result) }
    );
  };

  return (
    <>
      <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
        <Select
          onValueChange={(value) => setPairMode(value as PairMode)}
          value={pairMode}
        >
          <SelectTrigger aria-label={t('pair_mode')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="round_robin">{t('mode_round_robin')}</SelectItem>
            <SelectItem value="all_to_all">{t('mode_all_to_all')}</SelectItem>
            <SelectItem value="custom">{t('mode_custom')}</SelectItem>
          </SelectContent>
        </Select>
        {pairMode === 'custom' ? (
          <Select
            onValueChange={setCustomTargetId}
            value={customTargetId ?? undefined}
          >
            <SelectTrigger aria-label={t('custom_target')}>
              <SelectValue placeholder={t('custom_target')} />
            </SelectTrigger>
            <SelectContent>
              {npcs.map((npc) => (
                <SelectItem key={npc.id} value={npc.id}>
                  {npc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Textarea
          aria-label={t('queue_prompt')}
          className="min-h-20"
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('queue_prompt')}
          value={prompt}
        />
        <Input
          aria-label={t('turns')}
          max={12}
          min={1}
          onChange={(event) => setTurns(Number(event.target.value))}
          type="number"
          value={turns}
        />
        <Button
          className="w-full"
          disabled={
            !activeSessionId ||
            pairs.length === 0 ||
            mutations.runPairQueue.isPending
          }
          onClick={runQueue}
          type="button"
        >
          <Play className="h-4 w-4" />
          {t('run_pairs', { count: pairs.length })}
        </Button>
      </div>

      <RunTracePanel pairQueue={lastQueue} />
    </>
  );
}
