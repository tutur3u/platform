'use client';

import type { FleetCardLabels } from '@tuturuuu/ui/custom/fleet';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { FleetStatus } from './fleet-task-meta';
import type { FleetBucket, FleetGroupBy } from './fleet-triage';

export interface FleetCopy {
  card: FleetCardLabels;
  status: Record<FleetStatus, string>;
  priority: Record<'critical' | 'high' | 'normal' | 'low', string>;
  bucket: Record<FleetBucket, string>;
  groupBy: Record<FleetGroupBy, string>;
  view: {
    summaryLabel: string;
    stale: string;
    staleDetail: string;
    liveDetail: (running: number, review: number, ci: number) => string;
    blockedDetail: string;
    needsDetail: string;
    hidden: (queued: number, done: number) => string;
    groupByLabel: string;
    densityLabel: string;
    comfortable: string;
    compact: string;
    emptyBucket: string;
    emptyFleet: string;
    noGroup: string;
    needsCount: (count: number) => string;
    blockedCount: (count: number) => string;
  };
}

/** Every Fleet view string, read once from the `ws-task-boards.fleet` bundle. */
export function useFleetCopy(): FleetCopy {
  const t = useTranslations('ws-task-boards.fleet');
  return useMemo(
    () => ({
      view: {
        summaryLabel: t('summary_label'),
        stale: t('summary.stale'),
        staleDetail: t('summary.stale_detail'),
        liveDetail: (running: number, review: number, ci: number) =>
          t('summary.live_detail', { running, review, ci }),
        blockedDetail: t('summary.blocked_detail'),
        needsDetail: t('summary.needs_detail'),
        hidden: (queued: number, done: number) =>
          t('hidden_counts', { queued, done }),
        groupByLabel: t('group_by.label'),
        densityLabel: t('density.label'),
        comfortable: t('density.comfortable'),
        compact: t('density.compact'),
        emptyBucket: t('empty.bucket'),
        emptyFleet: t('empty.fleet'),
        noGroup: t('empty.no_group'),
        needsCount: (count: number) => t('needs_count', { count }),
        blockedCount: (count: number) => t('blocked_count', { count }),
      },
      card: {
        status: t('fields.status'),
        owner: t('fields.owner'),
        eta: t('fields.eta'),
        updated: t('fields.updated'),
        unowned: t('empty.unowned'),
        noEta: t('empty.no_eta'),
        noUpdate: t('empty.no_update'),
        overdue: t('overdue'),
        stale: t('stale'),
        needsUser: t('needs_you'),
        blockedBy: t('blocked_by'),
        titleTooLong: t('title_too_long'),
      },
      status: {
        needs_user: t('status.needs_user'),
        running: t('status.running'),
        waiting_review: t('status.waiting_review'),
        waiting_ci: t('status.waiting_ci'),
        blocked: t('status.blocked'),
        queued: t('status.queued'),
        done: t('status.done'),
        unknown: t('status.unknown'),
      },
      priority: {
        critical: t('priority.critical'),
        high: t('priority.high'),
        normal: t('priority.normal'),
        low: t('priority.low'),
      },
      bucket: {
        needs_me: t('buckets.needs_me'),
        live: t('buckets.live'),
        blocked: t('buckets.blocked'),
      },
      groupBy: {
        triage: t('group_by.triage'),
        product: t('group_by.product'),
        priority: t('group_by.priority'),
        owner: t('group_by.owner'),
      },
    }),
    [t]
  );
}
