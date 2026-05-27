'use client';

import { Loader2, Save } from '@tuturuuu/icons';
import type {
  AiAgentDefinition,
  SaveAiAgentPayload,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { buildAgentPayload, DEFAULT_MODEL } from './ai-agents-utils';
import {
  DiscordChannelFields,
  ZaloChannelFields,
} from './channel-config-fields';

export function AgentForm({
  agent,
  isPending,
  onSubmit,
}: {
  agent?: AiAgentDefinition;
  isPending: boolean;
  onSubmit: (payload: SaveAiAgentPayload, reset?: () => void) => void;
}) {
  const t = useTranslations('ai-agents-settings');
  const discord = agent?.channels.find(
    (channel) => channel.adapter === 'discord'
  );
  const zalo = agent?.channels.find((channel) => channel.adapter === 'zalo');

  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        onSubmit(buildAgentPayload(new FormData(form), agent), () =>
          form.reset()
        );
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={agent ? `${agent.id}-name` : 'new-name'}>
            {t('fields.name')}
          </Label>
          <Input
            defaultValue={agent?.name}
            id={agent ? `${agent.id}-name` : 'new-name'}
            name="name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={agent ? `${agent.id}-id` : 'new-id'}>
            {t('fields.agent_id')}
          </Label>
          <Input
            defaultValue={agent?.id}
            disabled={Boolean(agent)}
            id={agent ? `${agent.id}-id` : 'new-id'}
            name="id"
            pattern="[a-z0-9_-]{1,80}"
            required={!agent}
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor={agent ? `${agent.id}-workspaceId` : 'new-workspaceId'}
          >
            {t('fields.workspace_id')}
          </Label>
          <Input
            defaultValue={discord?.workspaceId || zalo?.workspaceId || ''}
            id={agent ? `${agent.id}-workspaceId` : 'new-workspaceId'}
            name="workspaceId"
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={agent ? `${agent.id}-modelId` : 'new-modelId'}>
            {t('fields.model')}
          </Label>
          <Input
            defaultValue={agent?.modelId ?? DEFAULT_MODEL}
            id={agent ? `${agent.id}-modelId` : 'new-modelId'}
            name="modelId"
            required
          />
        </div>
        <div className="flex items-center gap-3 pt-7">
          <Switch
            defaultChecked={agent?.enabled ?? true}
            id={agent ? `${agent.id}-enabled` : 'new-enabled'}
            name="enabled"
          />
          <Label htmlFor={agent ? `${agent.id}-enabled` : 'new-enabled'}>
            {t('fields.enabled')}
          </Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor={agent ? `${agent.id}-instructions` : 'new-instructions'}
        >
          {t('fields.instructions')}
        </Label>
        <Textarea
          defaultValue={agent?.instructions}
          id={agent ? `${agent.id}-instructions` : 'new-instructions'}
          name="instructions"
          rows={4}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DiscordChannelFields agentId={agent?.id} channel={discord} />
        <ZaloChannelFields agentId={agent?.id} channel={zalo} />
      </div>

      <div className="flex justify-end">
        <Button disabled={isPending} type="submit">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {agent ? t('actions.save') : t('actions.create')}
        </Button>
      </div>
    </form>
  );
}
