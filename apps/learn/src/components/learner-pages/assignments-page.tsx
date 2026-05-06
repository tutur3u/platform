'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completeTulearnAssignment,
  listTulearnAssignments,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { AssignmentRow } from './assignment-row';
import {
  EmptyState,
  LoadingState,
  Section,
  usePageMotion,
  useStudentId,
} from './shared';

export function AssignmentsPage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const studentId = useStudentId();
  const queryClient = useQueryClient();
  const scopeRef = usePageMotion();
  const assignments = useQuery({
    queryFn: () => listTulearnAssignments(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'assignments'],
  });
  const complete = useMutation({
    mutationFn: (postId: string) =>
      completeTulearnAssignment(wsId, { completed: true, postId }, studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tulearn', wsId, studentId, 'assignments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['tulearn', wsId, studentId, 'home'],
      });
    },
  });

  if (assignments.isLoading) return <LoadingState />;

  const rows = assignments.data?.assignments ?? [];
  const openRows = rows.filter((assignment) => !assignment.is_completed);

  return (
    <Section
      description={t('assignments.description', { count: openRows.length })}
      refValue={scopeRef}
      title={t('assignments.title')}
    >
      <div className="space-y-3">
        {rows.map((assignment) => (
          <AssignmentRow
            action={
              !assignment.is_completed ? (
                <Button
                  className="h-11 rounded-full bg-dynamic-green text-primary-foreground hover:bg-dynamic-green/90"
                  disabled={complete.isPending}
                  onClick={() => complete.mutate(assignment.id)}
                  size="sm"
                >
                  {t('assignments.markDone')}
                </Button>
              ) : null
            }
            assignment={assignment}
            completedLabel={t('common.completed')}
            key={assignment.id}
          />
        ))}
      </div>
      {!rows.length ? <EmptyState label={t('assignments.empty')} /> : null}
    </Section>
  );
}
