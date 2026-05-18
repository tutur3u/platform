'use client';

import { MessageSquareText, Plus, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { HiveNpc, HiveWorldData } from '@/engine/types';
import {
  useHiveResearchMutations,
  useHiveResearchSessions,
} from '@/hooks/use-hive-data';
import { HiveAgentBatchEditor } from './hive-agent-batch-editor';
import { HiveAgentPairQueue } from './hive-agent-pair-queue';
import { HiveAgentRoster } from './hive-agent-roster';
import type { HiveAiContextState } from './use-hive-ai-context';

type HiveAgentStudioPanelProps = {
  aiContext: HiveAiContextState;
  npcs: HiveNpc[];
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onSelectNpc: (npc: HiveNpc) => void;
  revision: number;
  serverId: string | null;
  world: HiveWorldData;
};

export function HiveAgentStudioPanel({
  aiContext,
  npcs,
  onPatchNpc,
  onSelectNpc,
  revision,
  serverId,
  world,
}: HiveAgentStudioPanelProps) {
  const t = useTranslations('studio.agents');
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    npcs.slice(0, 2).map((npc) => npc.id)
  );
  const [sessionName, setSessionName] = useState('Research session');
  const sessionsQuery = useHiveResearchSessions(serverId, true);
  const mutations = useHiveResearchMutations(serverId);
  const activeSession = sessionsQuery.data?.activeSession ?? null;

  useEffect(() => {
    setSelectedIds((current) => {
      const available = current.filter((id) =>
        npcs.some((npc) => npc.id === id)
      );
      return available.length > 0
        ? available
        : npcs.slice(0, 2).map((npc) => npc.id);
    });
  }, [npcs]);

  const toggleNpc = (npcId: string) => {
    setSelectedIds((current) =>
      current.includes(npcId)
        ? current.filter((id) => id !== npcId)
        : [...current, npcId]
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-background/95 text-foreground backdrop-blur-xl">
      <div className="border-border border-b p-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-dynamic-green" />
          <p className="font-semibold text-sm">{t('title')}</p>
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          {activeSession ? activeSession.name : t('no_session')}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
          <Input
            aria-label={t('session_name')}
            onChange={(event) => setSessionName(event.target.value)}
            value={sessionName}
          />
          <Button
            className="w-full"
            disabled={!serverId || mutations.createSession.isPending}
            onClick={() =>
              mutations.createSession.mutate({
                metadata: { source: 'agent-studio' },
                name: sessionName.trim() || t('fallback_session'),
                status: 'running',
              })
            }
            size="sm"
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('start_session')}
          </Button>
        </div>

        <HiveAgentRoster
          npcs={npcs}
          onSelectNpc={onSelectNpc}
          onToggleNpc={toggleNpc}
          selectedIds={selectedIds}
        />

        <HiveAgentBatchEditor
          npcs={npcs}
          onPatchNpc={onPatchNpc}
          selectedIds={selectedIds}
        />

        <HiveAgentPairQueue
          activeSessionId={activeSession?.id ?? null}
          aiContext={aiContext}
          npcs={npcs}
          revision={revision}
          selectedIds={selectedIds}
          serverId={serverId}
          world={world}
        />
      </div>

      <div className="border-border border-t p-3 text-muted-foreground text-xs">
        <MessageSquareText className="mr-1 inline h-3.5 w-3.5" />
        {t('context', {
          blocks: world.blocks.length,
          objects: world.objects.length,
        })}
      </div>
    </section>
  );
}
