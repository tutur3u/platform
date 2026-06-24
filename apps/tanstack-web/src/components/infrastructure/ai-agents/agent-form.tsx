'use client';

import { Loader2, Save } from '@tuturuuu/icons';
import type {
  AiAgentDefinition,
  SaveAiAgentPayload,
} from '@tuturuuu/internal-api/infrastructure/ai';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'use-intl';
import { buildAgentPayload, DEFAULT_MODEL } from './ai-agents-utils';
import {
  DiscordChannelFields,
  ZaloChannelFields,
} from './channel-config-fields';
import { WorkspacePicker } from './workspace-picker';

export function AgentForm({
  agent,
  includeInternalWorkspace = false,
  isPending,
  onRefresh,
  onSubmit,
}: {
  agent?: AiAgentDefinition;
  includeInternalWorkspace?: boolean;
  isPending: boolean;
  onRefresh?: () => void;
  onSubmit: (payload: SaveAiAgentPayload, reset?: () => void) => void;
}) {
  const t = useTranslations('ai-agents-settings');
  const discord = agent?.channels.find(
    (channel) => channel.adapter === 'discord'
  );
  const zalo = agent?.channels.find((channel) => channel.adapter === 'zalo');

  return (
    <form
      className="space-y-5 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        onSubmit(buildAgentPayload(new FormData(form), agent), () =>
          form.reset()
        );
      }}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
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
        <WorkspacePicker
          defaultValue={
            discord?.workspaceId || zalo?.workspaceId || ROOT_WORKSPACE_ID
          }
          id={agent ? `${agent.id}-workspaceId` : 'new-workspaceId'}
          includeInternalWorkspace={includeInternalWorkspace}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.45fr)]">
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
      </div>

      <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
        <Switch
          defaultChecked={agent?.enabled ?? true}
          id={agent ? `${agent.id}-enabled` : 'new-enabled'}
          name="enabled"
        />
        <Label htmlFor={agent ? `${agent.id}-enabled` : 'new-enabled'}>
          {t('fields.enabled')}
        </Label>
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

      <Tabs defaultValue="discord">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="discord">{t('channels.discord')}</TabsTrigger>
          <TabsTrigger value="zalo">{t('channels.zalo')}</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-4" forceMount value="discord">
          <DiscordChannelFields agentId={agent?.id} channel={discord} />
        </TabsContent>
        <TabsContent className="mt-4" forceMount value="zalo">
          <ZaloChannelFields
            agentId={agent?.id}
            channel={zalo}
            isPending={isPending}
            onRefresh={onRefresh}
          />
        </TabsContent>
      </Tabs>

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
