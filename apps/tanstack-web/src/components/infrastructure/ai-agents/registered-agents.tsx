'use client';

import type {
  AiAgentDefinition,
  SaveAiAgentPayload,
} from '@tuturuuu/internal-api/infrastructure/ai';
import { useTranslations } from 'use-intl';
import { AgentForm } from './agent-form';
import { AgentOperations } from './agent-operations';

export function RegisteredAgents({
  agents,
  isPending,
  onDeploy,
  onPause,
  onRefresh,
  onRotateZalo,
  onSave,
  onTest,
}: {
  agents: AiAgentDefinition[];
  isPending: boolean;
  onDeploy: (agentId: string, channelId: string) => void;
  onPause: (agentId: string, channelId: string) => void;
  onRefresh: () => void;
  onRotateZalo: (agentId: string, channelId: string) => void;
  onSave: (payload: SaveAiAgentPayload) => void;
  onTest: (agentId: string, channelId: string) => void;
}) {
  const t = useTranslations('ai-agents-settings');

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg">{t('registered.title')}</h2>
      {agents.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground">
          {t('registered.empty')}
        </div>
      ) : (
        agents.map((agent) => (
          <div className="space-y-4" key={agent.id}>
            <AgentForm
              agent={agent}
              includeInternalWorkspace
              isPending={isPending}
              onRefresh={onRefresh}
              onSubmit={onSave}
            />
            <AgentOperations
              agent={agent}
              isPending={isPending}
              onDeploy={onDeploy}
              onPause={onPause}
              onRotateZalo={onRotateZalo}
              onTest={onTest}
            />
          </div>
        ))
      )}
    </div>
  );
}
