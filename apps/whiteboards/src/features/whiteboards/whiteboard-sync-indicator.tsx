'use client';

import { CloudIcon, CloudOffIcon, Loader2Icon } from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { WhiteboardSyncStatus } from '@tuturuuu/whiteboard/react';

interface WhiteboardSyncIndicatorProps {
  status: WhiteboardSyncStatus;
  error: string | null;
  onRetry: () => void;
}

export function WhiteboardSyncIndicator({
  status,
  error,
  onRetry,
}: WhiteboardSyncIndicatorProps) {
  const t = useTranslations('common');
  const config = {
    synced: {
      icon: CloudIcon,
      label: t('whiteboard_synced'),
      className: 'bg-dynamic-green/10 text-dynamic-green',
      tooltip: t('whiteboard_synced_tooltip'),
    },
    syncing: {
      icon: Loader2Icon,
      label: t('whiteboard_syncing'),
      className: 'bg-dynamic-blue/10 text-dynamic-blue',
      tooltip: t('whiteboard_syncing_tooltip'),
    },
    error: {
      icon: CloudOffIcon,
      label: t('whiteboard_sync_failed'),
      className: 'bg-dynamic-red/10 text-dynamic-red',
      tooltip: error || t('whiteboard_sync_failed_tooltip'),
    },
  };

  const { icon: Icon, label, className, tooltip } = config[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={status === 'error' ? onRetry : undefined}
          className={cn(
            'flex cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
            className,
            status === 'error' && 'cursor-pointer hover:bg-dynamic-red/20'
          )}
        >
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              status === 'syncing' && 'animate-spin'
            )}
          />
          <span>{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
