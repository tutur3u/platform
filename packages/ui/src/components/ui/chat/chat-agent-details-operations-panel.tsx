'use client';

import {
  Copy,
  FlaskConical,
  LoaderCircle,
  Pause,
  Play,
  RotateCw,
  Webhook,
} from '@tuturuuu/icons';
import type { AiAgentChannelConfig } from '@tuturuuu/internal-api/infrastructure';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import {
  copyToClipboard,
  KeyValue,
  PanelSection,
} from './chat-agent-details-utils';

export function AgentOperationsPanel({
  channel,
  isPending,
  onCopySecret,
  onDeploy,
  onPause,
  onRotateSecret,
  onTest,
  secretPreview,
}: {
  channel: AiAgentChannelConfig;
  isPending: boolean;
  onCopySecret: () => void;
  onDeploy: () => void;
  onPause: () => void;
  onRotateSecret: () => void;
  onTest: (prompt?: string) => void;
  secretPreview: { label: string; value: string } | null;
}) {
  const t = useTranslations('chat');
  const [testPrompt, setTestPrompt] = useState('');
  const webhookUrl = channel.webhookUrl;

  return (
    <div className="space-y-4">
      <PanelSection
        icon={<Webhook className="size-4" />}
        title={t('agent_channel')}
      >
        <div className="space-y-2">
          <KeyValue label={t('agent_channel_id')} value={channel.id} />
          <KeyValue label={t('agent_adapter')} value={channel.adapter} />
          <KeyValue
            label={t('agent_last_event')}
            value={channel.lastEventAt ?? t('never')}
          />
          {webhookUrl ? (
            <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/20 p-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">
                {webhookUrl}
              </code>
              <Button
                aria-label={t('agent_copy_webhook')}
                className="size-7"
                onClick={() =>
                  copyToClipboard(webhookUrl, {
                    error: t('message_copy_failed'),
                    success: t('agent_copied_webhook'),
                  })
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          ) : null}
          {channel.lastError ? (
            <p className="rounded-md border border-dynamic-red/20 bg-dynamic-red/5 p-2 text-dynamic-red text-xs">
              {channel.lastError}
            </p>
          ) : null}
        </div>
      </PanelSection>

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={isPending} onClick={onDeploy} size="sm" type="button">
          <Play className="size-4" />
          {t('agent_deploy')}
        </Button>
        <Button
          disabled={isPending}
          onClick={onPause}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Pause className="size-4" />
          {t('agent_pause')}
        </Button>
      </div>

      <PanelSection
        icon={<FlaskConical className="size-4" />}
        title={t('agent_test')}
      >
        <div className="space-y-2">
          <Input
            onChange={(event) => setTestPrompt(event.target.value)}
            placeholder={t('agent_test_prompt')}
            value={testPrompt}
          />
          <Button
            className="w-full"
            disabled={isPending}
            onClick={() => onTest(testPrompt.trim() || undefined)}
            type="button"
            variant="outline"
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <FlaskConical className="size-4" />
            )}
            {t('agent_test')}
          </Button>
          <p className="text-muted-foreground text-xs leading-5">
            {channel.adapter === 'discord'
              ? t('agent_discord_live_test_hint')
              : t('agent_live_test_hint')}
          </p>
        </div>
      </PanelSection>

      {channel.adapter === 'zalo' ? (
        <PanelSection
          icon={<RotateCw className="size-4" />}
          title={t('agent_rotate_secret')}
        >
          <div className="space-y-2">
            <Button
              className="w-full"
              disabled={isPending}
              onClick={onRotateSecret}
              type="button"
              variant="outline"
            >
              <RotateCw className="size-4" />
              {t('agent_rotate_secret')}
            </Button>
            {secretPreview ? (
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <div className="mb-1 font-medium">
                  {t('agent_secret_value')}: {secretPreview.label}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono">
                    {secretPreview.value}
                  </code>
                  <Button
                    aria-label={t('copy_as_text')}
                    className="size-7"
                    onClick={async () => {
                      await copyToClipboard(secretPreview.value, {
                        error: t('message_copy_failed'),
                        success: t('message_copied'),
                      });
                      onCopySecret();
                    }}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </PanelSection>
      ) : null}
    </div>
  );
}
