'use client';

import { CheckCircle2, ClipboardCheck } from '@tuturuuu/icons';
import type { TulearnAssignmentSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

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
    <div
      className="grid gap-4 rounded-[1.75rem] border border-border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-dynamic-green/30 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      data-tulearn-reveal
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-2xl',
              assignment.is_completed
                ? 'bg-dynamic-green text-primary-foreground'
                : 'bg-dynamic-orange/10 text-dynamic-orange'
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
            <Badge className="bg-dynamic-green/15 text-dynamic-green hover:bg-dynamic-green/15">
              {completedLabel}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-muted-foreground text-sm">
          {assignment.course.name ?? t('courses.untitled')}
        </p>
      </div>
      {action}
    </div>
  );
}
