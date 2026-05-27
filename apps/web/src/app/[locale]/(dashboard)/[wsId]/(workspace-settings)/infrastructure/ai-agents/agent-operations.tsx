'use client';

import { FlaskConical, Pause, Play, RotateCw } from '@tuturuuu/icons';
import type { AiAgentDefinition } from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function AgentOperations({
  agent,
  isPending,
  onDeploy,
  onPause,
  onRotateZalo,
  onTest,
}: {
  agent: AiAgentDefinition;
  isPending: boolean;
  onDeploy: (agentId: string, channelId: string) => void;
  onPause: (agentId: string, channelId: string) => void;
  onRotateZalo: (agentId: string, channelId: string) => void;
  onTest: (agentId: string, channelId: string) => void;
}) {
  const t = useTranslations('ai-agents-settings');

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {agent.channels.map((channel) => (
        <div
          className="space-y-3 rounded-lg border border-border bg-background p-4"
          key={channel.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{channel.displayName}</div>
              <div className="font-mono text-muted-foreground text-xs">
                {channel.id}
              </div>
            </div>
            <Badge variant={channel.enabled ? 'success' : 'secondary'}>
              {channel.enabled ? t('status.enabled') : t('status.disabled')}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending}
              onClick={() => onDeploy(agent.id, channel.id)}
              size="sm"
              type="button"
            >
              <Play className="h-4 w-4" />
              {t('actions.deploy')}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onPause(agent.id, channel.id)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Pause className="h-4 w-4" />
              {t('actions.pause')}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => onTest(agent.id, channel.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              <FlaskConical className="h-4 w-4" />
              {t('actions.test')}
            </Button>
            {channel.adapter === 'zalo' ? (
              <Button
                disabled={isPending}
                onClick={() => onRotateZalo(agent.id, channel.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCw className="h-4 w-4" />
                {t('actions.rotate_zalo_secret')}
              </Button>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm">
            {channel.secrets.map((secret) => (
              <div className="flex justify-between gap-3" key={secret.name}>
                <span className="text-muted-foreground">{secret.name}</span>
                <span>
                  {secret.configured
                    ? t('secret.configured', {
                        suffix: secret.lastFour ?? '****',
                      })
                    : t('secret.missing')}
                </span>
              </div>
            ))}
          </div>
          {channel.lastError ? (
            <p className="text-destructive text-sm">{channel.lastError}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
