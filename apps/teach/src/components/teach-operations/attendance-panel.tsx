'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listWorkspaceCourseAttendance,
  listWorkspaceCourseMembers,
  type TeachAttendanceStatus,
  updateWorkspaceCourseAttendance,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const statusOptions: TeachAttendanceStatus[] = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'NONE',
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendancePanel({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations('teachOperations');
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIsoDate());
  const [draft, setDraft] = useState<Record<string, TeachAttendanceStatus>>({});
  const membersQuery = useQuery({
    enabled: Boolean(courseId),
    queryFn: () => listWorkspaceCourseMembers(wsId, courseId),
    queryKey: ['teach-course-members', wsId, courseId],
  });
  const attendanceQuery = useQuery({
    enabled: Boolean(courseId && date),
    queryFn: () => listWorkspaceCourseAttendance(wsId, courseId, date),
    queryKey: ['teach-attendance', wsId, courseId, date],
  });
  const saveAttendance = useMutation({
    mutationFn: () =>
      updateWorkspaceCourseAttendance(
        wsId,
        courseId,
        (membersQuery.data?.data ?? []).map((member) => ({
          date,
          status:
            draft[member.id] ??
            attendanceQuery.data?.data.find(
              (entry) => entry.user_id === member.id
            )?.status ??
            'NONE',
          user_id: member.id,
        }))
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['teach-attendance', wsId, courseId, date],
      }),
  });

  const attendanceByUser = new Map(
    (attendanceQuery.data?.data ?? []).map((entry) => [entry.user_id, entry])
  );

  return (
    <section className="space-y-4">
      <input
        className="h-11 border-2 border-border bg-background px-3 font-bold outline-none focus:border-primary"
        onChange={(event) => setDate(event.target.value)}
        type="date"
        value={date}
      />
      <div className="grid gap-3">
        {(membersQuery.data?.data ?? []).map((member) => {
          const value =
            draft[member.id] ??
            attendanceByUser.get(member.id)?.status ??
            'NONE';
          return (
            <article
              className="grid gap-3 border-2 border-border bg-card p-3 shadow-[3px_3px_0_var(--border)] md:grid-cols-[minmax(0,1fr)_auto]"
              key={member.id}
            >
              <div>
                <p className="font-black">
                  {member.full_name ?? member.display_name ?? member.email}
                </p>
                <p className="text-muted-foreground text-xs">{member.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((status) => (
                  <button
                    aria-pressed={value === status}
                    className="border-2 border-border bg-background px-2 py-1 font-black text-xs data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                    data-active={value === status}
                    key={status}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        [member.id]: status,
                      }))
                    }
                    type="button"
                  >
                    {t(`attendanceStatus.${status}`)}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      <button
        className="inline-flex h-11 items-center border-2 border-border bg-primary px-4 font-black text-primary-foreground shadow-[3px_3px_0_var(--border)] disabled:opacity-60"
        disabled={saveAttendance.isPending || !membersQuery.data?.data.length}
        onClick={() => saveAttendance.mutate()}
        type="button"
      >
        {saveAttendance.isPending ? t('saving') : t('saveAttendance')}
      </button>
    </section>
  );
}
