'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { FleetCard } from '@tuturuuu/ui/custom/fleet';
import { useLocale } from 'next-intl';
import {
  formatFleetAge,
  formatFleetEta,
  getFleetProduct,
} from './fleet-format';
import {
  getFleetEtaState,
  getFleetStaleness,
  isFleetTitleTooLong,
} from './fleet-task-meta';
import type { FleetItem } from './fleet-triage';
import type { FleetCopy } from './use-fleet-copy';

interface FleetTaskCardProps {
  item: FleetItem<Task>;
  copy: FleetCopy;
  code?: string | null;
  density: 'comfortable' | 'compact';
  now: number;
  onOpen: (task: Task) => void;
}

/** Maps one parsed fleet task onto the design-system FleetCard. */
export function FleetTaskCard({
  item,
  copy,
  code,
  density,
  now,
  onOpen,
}: FleetTaskCardProps) {
  const locale = useLocale();
  const { task, meta } = item;
  const etaLabel = formatFleetEta(meta.eta, locale, now);
  const ageLabel = formatFleetAge(meta.lastUpdate, locale, now);
  return (
    <FleetCard
      blockedBy={meta.blockedBy}
      code={code}
      density={density}
      eta={{
        state: etaLabel ? getFleetEtaState(meta.eta, meta.status, now) : 'none',
        label: etaLabel ?? undefined,
        title: meta.eta ?? undefined,
      }}
      labels={copy.card}
      links={meta.links.map((link) => ({
        type: link.type,
        label:
          link.type === 'commit'
            ? link.value.slice(0, 7)
            : shortLink(link.value),
        href: link.href,
      }))}
      needsUser={meta.needsUser}
      needsUserReason={meta.needsUserReason}
      onOpen={() => onOpen(task)}
      owner={meta.owner}
      priority={meta.priority}
      priorityLabel={meta.priority ? copy.priority[meta.priority] : undefined}
      product={getFleetProduct(meta.product)}
      status={meta.status}
      statusLabel={copy.status[meta.status]}
      title={task.name}
      titleTooLong={isFleetTitleTooLong(task.name)}
      updated={{
        level: ageLabel ? getFleetStaleness(meta.lastUpdate, now) : 'unknown',
        label: ageLabel ?? undefined,
        title: meta.lastUpdate ?? undefined,
      }}
    />
  );
}

function shortLink(value: string): string {
  const pr = value.match(/\/pull\/(\d+)/);
  if (pr) return `#${pr[1]}`;
  return value.replace(/^https?:\/\//, '').slice(0, 24);
}
