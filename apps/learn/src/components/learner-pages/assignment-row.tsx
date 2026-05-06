'use client';

import { CheckCircle2, ClipboardCheck } from '@tuturuuu/icons';
import type { TulearnAssignmentSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BrutalCard } from './shared';

export function AssignmentRow({
  action,
  assignment,
  completedLabel,
}: {
  action?: ReactNode;
  assignment: TulearnAssignmentSummary;
  completedLabel: string;
}) {
  const t = useTranslations();

  return (
    <BrutalCard className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center border-2 border-foreground',
              assignment.is_completed
                ? 'bg-dynamic-yellow text-foreground'
                : 'bg-background text-foreground'
            )}
          >
            {assignment.is_completed ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <ClipboardCheck className="h-5 w-5" />
            )}
          </div>
          <h3 className="font-bold text-xl tracking-normal">
            {assignment.title ?? t('assignments.untitled')}
          </h3>
          {assignment.is_completed ? (
            <Badge className="rounded-none border-2 border-foreground bg-dynamic-yellow text-foreground hover:bg-dynamic-yellow">
              {completedLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-muted-foreground text-sm">
          {assignment.course.name ?? t('courses.untitled')}
        </p>
      </div>
      {action}
    </BrutalCard>
  );
}
