'use client';

import type { AiAgentDefinition } from '@tuturuuu/internal-api/infrastructure/ai';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

export function ChannelStatus({
  channel,
}: {
  channel: AiAgentDefinition['channels'][number];
}) {
  const t = useTranslations('ai-agents-settings');
  const variant = channel.status === 'deployed' ? 'success' : 'secondary';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={variant}>{t(`status.${channel.status}`)}</Badge>
      {channel.webhookUrl ? (
        <code className="rounded border border-border px-2 py-1 text-xs">
          {channel.webhookUrl}
        </code>
      ) : null}
    </div>
  );
}
