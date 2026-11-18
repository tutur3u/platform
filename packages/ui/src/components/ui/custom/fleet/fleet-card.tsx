import { Flag } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { Field, FleetBlockedRow } from './fleet-card-parts';
import { type FleetCardLink, FleetLinks } from './fleet-links';
import {
  EtaIndicator,
  type FleetEtaStateValue,
  type FleetStalenessValue,
  NeedsUserBadge,
  StalenessIndicator,
} from './fleet-indicators';
import { FleetStatusChip, type FleetStatusValue } from './fleet-status-chip';

export type FleetPriorityValue = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY: Record<
  FleetPriorityValue,
  { code: string; className: string }
> = {
  critical: { code: 'P0', className: 'text-dynamic-red' },
  high: { code: 'P1', className: 'text-dynamic-orange' },
  normal: { code: 'P2', className: 'text-dynamic-blue' },
  low: { code: 'P3', className: 'text-muted-foreground' },
};

/** Every visible word on the card, supplied by the caller in the viewer's language. */
export interface FleetCardLabels {
  status: string;
  owner: string;
  eta: string;
  updated: string;
  unowned: string;
  noEta: string;
  noUpdate: string;
  overdue: string;
  stale: string;
  needsUser: string;
  blockedBy: string;
  titleTooLong: string;
}

export interface FleetCardProps {
  title: string;
  titleTooLong?: boolean;
  status: FleetStatusValue;
  statusLabel: string;
  code?: string | null;
  product?: { label: string; dotClassName?: string } | null;
  priority?: FleetPriorityValue | null;
  priorityLabel?: string;
  owner?: string | null;
  eta: { state: FleetEtaStateValue; label?: ReactNode; title?: string };
  updated: { level: FleetStalenessValue; label?: ReactNode; title?: string };
  needsUser?: boolean;
  needsUserReason?: ReactNode;
  blockedBy?: ReactNode;
  links?: FleetCardLink[];
  density?: 'comfortable' | 'compact';
  selected?: boolean;
  labels: FleetCardLabels;
  onOpen?: () => void;
  className?: string;
}

/** A fleet task: a bounded title over four fixed fields (status, owner, ETA, last update). */
export function FleetCard(props: FleetCardProps) {
  const { labels: L, density = 'comfortable' } = props;
  const compact = density === 'compact';
  const prio = props.priority ? PRIORITY[props.priority] : null;
  return (
    <article
      aria-label={props.title}
      className={cn(
        'relative grid w-full gap-2.5 rounded-xl bg-card p-3.5 text-left text-card-foreground shadow-sm transition-shadow hover:shadow-md',
        compact && 'gap-2 px-3 py-2.5',
        props.selected && 'ring-2 ring-ring',
        props.className
      )}
      data-fleet-status={props.status}
    >
      <div className="flex min-w-0 items-center gap-2">
        {props.product ? (
          <span className="inline-flex h-5 min-w-0 items-center gap-1.5 rounded-full bg-muted px-2 font-semibold text-[11.5px]">
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full bg-muted-foreground',
                props.product.dotClassName
              )}
            />
            <span className="truncate">{props.product.label}</span>
          </span>
        ) : null}
        {prio ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-bold font-mono text-[11.5px]',
              prio.className
            )}
            title={props.priorityLabel}
          >
            <Flag aria-hidden className="size-3" />
            {prio.code}
          </span>
        ) : null}
        <span className="flex-1" />
        {props.code ? (
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {props.code}
          </span>
        ) : null}
      </div>

      <h3
        className={cn(
          'm-0 break-words font-bold text-[15px] leading-[21px]',
          compact ? 'line-clamp-1 text-sm' : 'line-clamp-2'
        )}
      >
        {props.onOpen ? (
          <button
            className="text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            onClick={props.onOpen}
            type="button"
          >
            {props.title}
          </button>
        ) : (
          props.title
        )}
      </h3>
      {props.titleTooLong ? (
        <span className="sr-only">{L.titleTooLong}</span>
      ) : null}

      {props.needsUser ? (
        <NeedsUserBadge label={L.needsUser} reason={props.needsUserReason} />
      ) : props.blockedBy ? (
        <FleetBlockedRow label={L.blockedBy} reason={props.blockedBy} />
      ) : null}

      <div
        className={cn(
          'grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-2.5',
          compact && 'flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-2'
        )}
      >
        <Field compact={compact} label={L.status}>
          <FleetStatusChip label={props.statusLabel} status={props.status} />
        </Field>
        <Field compact={compact} label={L.owner}>
          <span
            className={cn(
              'truncate text-[13px]',
              props.owner ? 'font-semibold' : 'text-muted-foreground'
            )}
          >
            {props.owner ?? L.unowned}
          </span>
        </Field>
        <Field compact={compact} label={L.eta}>
          <EtaIndicator
            emptyLabel={L.noEta}
            label={props.eta.label}
            overdueLabel={L.overdue}
            state={props.eta.state}
            title={props.eta.title}
          />
        </Field>
        <Field compact={compact} label={L.updated}>
          <StalenessIndicator
            label={props.updated.label}
            level={props.updated.level}
            staleLabel={L.stale}
            title={props.updated.title}
            unknownLabel={L.noUpdate}
          />
        </Field>
      </div>

      {props.links?.length ? (
        <FleetLinks
          className="relative z-10"
          links={props.links}
          max={compact ? 1 : 2}
        />
      ) : null}
    </article>
  );
}
