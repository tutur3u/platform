'use client';

import { ArrowRight } from '@tuturuuu/icons';
import type {
  TulearnAssignmentSummary,
  TulearnMarkSummary,
} from '@tuturuuu/internal-api';
import { Link } from '@/i18n/navigation';
import { AssignmentRow } from './assignment-row';
import { MarkCard } from './mark-card';
import { EmptyState, SurfaceCard } from './shared';

export function FeatureList({
  actionHref,
  actionLabel,
  completedLabel,
  emptyLabel,
  items,
  title,
  type,
}: {
  actionHref?: string;
  actionLabel?: string;
  completedLabel?: string;
  emptyLabel: string;
  items: Array<TulearnAssignmentSummary | TulearnMarkSummary>;
  title: string;
  type: 'assignment' | 'mark';
}) {
  return (
    <SurfaceCard className="p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="font-bold text-2xl tracking-normal">{title}</h2>
        {actionHref && actionLabel ? (
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-primary px-4 font-semibold text-primary-foreground text-sm transition"
            href={actionHref}
          >
            {actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      <div className="space-y-3">
        {items.map((item) =>
          type === 'assignment' ? (
            <AssignmentRow
              assignment={item as TulearnAssignmentSummary}
              completedLabel={completedLabel ?? ''}
              key={item.id}
            />
          ) : (
            <MarkCard
              index={0}
              key={item.id}
              mark={item as TulearnMarkSummary}
            />
          )
        )}
      </div>
      {!items.length ? <EmptyState label={emptyLabel} /> : null}
    </SurfaceCard>
  );
}
