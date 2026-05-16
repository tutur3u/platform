'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserMinus, UserPlus } from '@tuturuuu/icons';
import {
  addWorkspaceCourseMembers,
  listWorkspaceCourseMembers,
  listWorkspaceUsers,
  removeWorkspaceCourseMember,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function CourseMembersPanel({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations('teachMembers');
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const membersQuery = useQuery({
    queryFn: () => listWorkspaceCourseMembers(wsId, courseId),
    queryKey: ['teach-course-members', wsId, courseId],
  });
  const usersQuery = useQuery({
    queryFn: () => listWorkspaceUsers(wsId, { limit: 8, q }),
    queryKey: ['teach-workspace-users', wsId, q],
  });
  const invalidateMembers = () =>
    queryClient.invalidateQueries({
      queryKey: ['teach-course-members', wsId, courseId],
    });
  const addMember = useMutation({
    mutationFn: (memberId: string) =>
      addWorkspaceCourseMembers(wsId, courseId, { memberIds: [memberId] }),
    onSuccess: invalidateMembers,
  });
  const removeMember = useMutation({
    mutationFn: (memberId: string) =>
      removeWorkspaceCourseMember(wsId, courseId, memberId),
    onSuccess: invalidateMembers,
  });
  const memberIds = new Set(
    (membersQuery.data?.data ?? []).map((member) => member.id)
  );

  return (
    <section className="grid gap-4 border-2 border-border bg-background p-4 shadow-[5px_5px_0_var(--border)] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div>
        <h2 className="font-black text-xl">{t('title')}</h2>
        <div className="mt-3 grid gap-2">
          {(membersQuery.data?.data ?? []).map((member) => (
            <div
              className="flex items-center justify-between gap-3 border-2 border-border bg-card px-3 py-2"
              key={member.id}
            >
              <span className="min-w-0">
                <span className="block truncate font-bold">
                  {member.full_name ?? member.display_name ?? member.email}
                </span>
                <span className="block truncate text-muted-foreground text-xs">
                  {member.email}
                </span>
              </span>
              <button
                className="shrink-0 border-2 border-border bg-background p-2 shadow-[2px_2px_0_var(--border)]"
                onClick={() => removeMember.mutate(member.id)}
                type="button"
              >
                <UserMinus className="h-4 w-4" />
                <span className="sr-only">{t('remove')}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="flex h-11 items-center gap-2 border-2 border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            onChange={(event) => setQ(event.target.value)}
            placeholder={t('searchPlaceholder')}
            value={q}
          />
        </label>
        <div className="mt-3 grid gap-2">
          {(usersQuery.data?.data ?? [])
            .filter((user) => !memberIds.has(user.id))
            .map((user) => (
              <button
                className="flex items-center justify-between gap-3 border-2 border-border bg-card px-3 py-2 text-left shadow-[2px_2px_0_var(--border)]"
                key={user.id}
                onClick={() => addMember.mutate(user.id)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">
                    {user.full_name ?? user.display_name ?? user.email}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {user.email}
                  </span>
                </span>
                <UserPlus className="h-4 w-4 shrink-0" />
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}
