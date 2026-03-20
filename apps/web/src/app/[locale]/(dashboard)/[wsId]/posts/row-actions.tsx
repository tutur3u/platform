'use client';

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MailX,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import type { PostEmail } from './types';

type QueueStatusLabelKey =
  | 'blocked'
  | 'cancelled'
  | 'failed'
  | 'processing'
  | 'queued'
  | 'sent';

function getStatusAppearance(status: PostEmail['queue_status']): {
  icon: ComponentType<{ className?: string }>;
  className: string;
  labelKey: QueueStatusLabelKey;
} {
  switch (status) {
    case 'sent':
      return {
        icon: CheckCircle2,
        className:
          'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
        labelKey: 'sent',
      };
    case 'processing':
      return {
        icon: LoaderCircle,
        className:
          'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
        labelKey: 'processing',
      };
    case 'failed':
      return {
        icon: AlertTriangle,
        className: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
        labelKey: 'failed',
      };
    case 'blocked':
      return {
        icon: Ban,
        className:
          'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
        labelKey: 'blocked',
      };
    case 'cancelled':
      return {
        icon: MailX,
        className: 'border-muted bg-muted text-muted-foreground',
        labelKey: 'cancelled',
      };
    default:
      return {
        icon: Clock3,
        className:
          'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
        labelKey: 'queued',
      };
  }
}

export default function PostsRowActions({ data }: { data: PostEmail }) {
  const t = useTranslations('post-email-data-table');
  const {
    icon: Icon,
    className,
    labelKey,
  } = getStatusAppearance(data.queue_status);

  return (
    <div className="flex flex-none items-center justify-end gap-2">
      <Badge variant="outline" className={className}>
        <Icon className="mr-1 h-3.5 w-3.5" />
        {t(labelKey)}
      </Badge>
    </div>
  );
}
