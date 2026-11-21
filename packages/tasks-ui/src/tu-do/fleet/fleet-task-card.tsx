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
  getFleetDisplayTitle,
  getFleetEtaState,
  getFleetStaleness,
  isFleetTitleTooLong,
} from './fleet-task-meta';
import type { FleetItem } from './fleet-triage';
import type { FleetCopy } from './use-fleet-copy';

interface FleetTaskCardProps {
  item: FleetItem<Task>;
  copy: FleetCopy;
  density: 'comfortable' | 'compact';
  now: number;
  onOpen: (task: Task) => void;
}

/** Maps one parsed fleet task onto the design-system FleetCard. */
export function FleetTaskCard({
  item,
  copy,
  density,
  now,
  onOpen,
}: FleetTaskCardProps) {
  const locale = useLocale();
  const { task, meta } = item;
  const etaLabel = formatFleetEta(meta.eta, locale, now);
  const ageLabel = formatFleetAge(meta.lastUpdate, locale, now);
  const code =
    meta.code ?? (task.display_number ? `#${task.display_number}` : null);
  const title = getFleetDisplayTitle(task.name, meta.code);
  const blockedBy = meta.blocked
    ? (meta.blockedBy ??
      (meta.blockedByCount > 0
        ? copy.view.blockedByTasks(meta.blockedByCount)
        : copy.view.blockedNoReason))
    : null;
  return (
    <FleetCard
      blockedBy={blockedBy}
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
      ownerKind={meta.ownerKind}
      priority={meta.priority}
      priorityLabel={meta.priority ? copy.priority[meta.priority] : undefined}
      product={getFleetProduct(meta.product)}
      status={meta.status}
      statusLabel={copy.status[meta.status]}
      fullTitle={task.name}
      title={title}
      titleTooLong={isFleetTitleTooLong(title)}
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
