'use client';

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Loader,
  MailX,
  SkipForward,
} from '@tuturuuu/icons';
import type { ComponentType } from 'react';
import type { PostEmailQueueStatus } from './types';

export type PostEmailStatusLabelKey = PostEmailQueueStatus;

export const POST_EMAIL_STATUS_ORDER: PostEmailQueueStatus[] = [
  'queued',
  'processing',
  'sent',
  'failed',
  'blocked',
  'cancelled',
  'skipped',
];

export function getPostEmailStatusAppearance(status?: PostEmailQueueStatus): {
  icon: ComponentType<{ className?: string }>;
  className: string;
  iconClassName?: string;
  labelKey: PostEmailStatusLabelKey;
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
        icon: Loader,
        className:
          'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
        iconClassName: 'animate-spin',
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
    case 'skipped':
      return {
        icon: SkipForward,
        className:
          'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
        labelKey: 'skipped',
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
