'use client';

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Loader,
  MailX,
  SkipForward,
  XCircle,
} from '@tuturuuu/icons';
import type { ComponentType } from 'react';
import type {
  PostApprovalStatus,
  PostEmailQueueStatus,
  PostReviewStage,
} from './types';

export const POST_REVIEW_STAGE_ORDER: PostReviewStage[] = [
  'missing_check',
  'pending_approval',
  'approved_awaiting_delivery',
  'undeliverable',
  'queued',
  'processing',
  'sent',
  'delivery_failed',
  'skipped',
  'rejected',
];

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

export const POST_APPROVAL_STATUS_ORDER: PostApprovalStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
];

export function getPostReviewStageAppearance(status: PostReviewStage): {
  icon: ComponentType<{ className?: string }>;
  className: string;
  iconClassName?: string;
  labelKey: PostReviewStage;
} {
  switch (status) {
    case 'missing_check':
      return {
        icon: CircleHelp,
        className:
          'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
        labelKey: 'missing_check',
      };
    case 'pending_approval':
      return {
        icon: Clock3,
        className:
          'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
        labelKey: 'pending_approval',
      };
    case 'approved_awaiting_delivery':
      return {
        icon: CheckCircle2,
        className:
          'border-dynamic-cyan/20 bg-dynamic-cyan/10 text-dynamic-cyan',
        labelKey: 'approved_awaiting_delivery',
      };
    case 'undeliverable':
      return {
        icon: Ban,
        className:
          'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
        labelKey: 'undeliverable',
      };
    case 'queued':
      return {
        icon: Clock3,
        className:
          'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
        labelKey: 'queued',
      };
    case 'processing':
      return {
        icon: Loader,
        className:
          'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
        iconClassName: 'animate-spin',
        labelKey: 'processing',
      };
    case 'sent':
      return {
        icon: CheckCircle2,
        className:
          'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
        labelKey: 'sent',
      };
    case 'delivery_failed':
      return {
        icon: AlertTriangle,
        className: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
        labelKey: 'delivery_failed',
      };
    case 'skipped':
      return {
        icon: SkipForward,
        className:
          'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
        labelKey: 'skipped',
      };
    case 'rejected':
      return {
        icon: XCircle,
        className: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
        labelKey: 'rejected',
      };
  }
}

export function getPostApprovalStatusAppearance(status?: PostApprovalStatus): {
  icon: ComponentType<{ className?: string }>;
  className: string;
  labelKey: 'approved' | 'pending' | 'rejected';
} {
  switch (status) {
    case 'APPROVED':
      return {
        icon: CheckCircle2,
        className:
          'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
        labelKey: 'approved',
      };
    case 'REJECTED':
      return {
        icon: XCircle,
        className: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
        labelKey: 'rejected',
      };
    default:
      return {
        icon: Clock3,
        className:
          'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
        labelKey: 'pending',
      };
  }
}

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
