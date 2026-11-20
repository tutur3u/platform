'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completeTulearnAssignment,
  listTulearnAssignments,
  type TulearnAssignmentSummary,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { AssignmentRow } from './assignment-row';
import { withLearnerStudent } from './learner-navigation';
import { LearnerRequestError } from './learner-request-state';
import { EmptyState, LoadingState, useStudentId } from './shared';

export function AssignmentsPage({ wsId }: { wsId: string }) {
  const studentId = useStudentId();
  const queryClient = useQueryClient();
  const assignments = useQuery({
    queryFn: () => listTulearnAssignments(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'assignments'],
  });
  const complete = useMutation({
    mutationFn: (postId: string) =>
      completeTulearnAssignment(wsId, { completed: true, postId }, studentId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['tulearn', wsId, studentId, 'assignments'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['tulearn', wsId, studentId, 'home'],
        }),
      ]);
    },
  });

  if (assignments.isPending) return <LoadingState />;
  if (!assignments.data) {
    return <LearnerRequestError retry={() => void assignments.refetch()} />;
  }

  return (
    <AssignmentBoard
      assignments={assignments.data.assignments}
      complete={(id) => complete.mutate(id)}
      completionFailed={complete.isError}
      completionPending={complete.isPending}
      readOnly={assignments.data.readOnly === true}
      studentId={studentId}
      wsId={wsId}
    />
  );
}

export function AssignmentBoard({
  assignments,
  complete,
  completionFailed,
  completionPending,
  readOnly,
  studentId,
  wsId,
}: {
  assignments: TulearnAssignmentSummary[];
  complete: (id: string) => void;
  completionFailed: boolean;
  completionPending: boolean;
  readOnly: boolean;
  studentId: string | null;
  wsId: string;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const open = assignments.filter((assignment) => !assignment.is_completed);
  const completed = assignments.filter((assignment) => assignment.is_completed);
  const sections = [
    {
      id: 'open',
      title: t('assignments.open'),
      empty: t('learnerWorkspace.noOpenAssignments'),
      rows: open,
    },
    {
      id: 'completed',
      title: t('common.completed'),
      empty: t('assignments.noCompleted'),
      rows: completed,
    },
  ] as const;

  return (
    <main className="space-y-5">
      <h1 className="font-semibold text-3xl tracking-tight">
        {t('assignments.title')}
      </h1>
      {completionFailed && (
        <p className="text-destructive text-sm" role="alert">
          {t('assignments.completionError')}
        </p>
      )}
      <Tabs defaultValue="open">
        <TabsList aria-label={t('assignments.title')}>
          {sections.map(({ id, title, rows }) => (
            <TabsTrigger key={id} value={id}>
              {title}
              <span className="ml-1 tabular-nums">
                {format.number(rows.length)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map(({ id, empty, rows }) => (
          <TabsContent className="space-y-3" key={id} value={id}>
            {!rows.length && <EmptyState label={empty} />}
            {rows.map((assignment) => (
              <AssignmentRow
                action={
                  assignment.is_test ? (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={withLearnerStudent(
                          `/${wsId}/courses/${assignment.course.id}/tests/${assignment.id}`,
                          studentId
                        )}
                      >
                        {assignment.is_completed
                          ? t('courses.reviewTest')
                          : t('assignments.openAssessment')}
                      </Link>
                    </Button>
                  ) : !readOnly && !assignment.is_completed ? (
                    <Button
                      disabled={completionPending}
                      onClick={() => complete(assignment.id)}
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
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
