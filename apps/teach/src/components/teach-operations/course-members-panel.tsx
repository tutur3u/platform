'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Search, UserMinus, UserPlus } from '@tuturuuu/icons';
import {
  addWorkspaceCourseMembers,
  listWorkspaceCourseMembers,
  listWorkspaceUsers,
  removeWorkspaceCourseMember,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { resolveUserFullName } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { courseContactsLinks } from './course-contacts-links';

export function CourseMembersPanel({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations('teachMembers');
  const common = useTranslations('common');
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const contactsLinks = courseContactsLinks(wsId, courseId);
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
    <section className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-xl">{t('title')}</h2>
          {contactsLinks && membersQuery.isSuccess && (
            <Button asChild size="sm" variant="outline">
              <a href={contactsLinks.group}>
                {t('openContacts')}
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
          )}
        </div>
        <div className="mt-3 grid gap-2">
          {membersQuery.isPending && (
            <div aria-label={common('loading')} role="status">
              <Skeleton className="h-12 w-full" />
            </div>
          )}
          {membersQuery.isError && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-sm" role="status">
                {t('loadError')}
              </p>
              <Button
                onClick={() => void membersQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {common('retry')}
              </Button>
            </div>
          )}
          {membersQuery.isSuccess && memberIds.size === 0 && (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          )}
          {(membersQuery.data?.data ?? []).map((member) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
              key={member.id}
            >
              <span className="min-w-0">
                {contactsLinks ? (
                  <a
                    className="block truncate rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    href={contactsLinks.profile(member.id)}
                  >
                    {resolveUserFullName(member)}
                  </a>
                ) : (
                  <span className="block truncate font-medium">
                    {resolveUserFullName(member)}
                  </span>
                )}
                <span className="block truncate text-muted-foreground text-xs">
                  {member.email}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {(member.role === 'TEACHER' || member.role === 'STUDENT') && (
                  <Badge variant="secondary">
                    {member.role === 'TEACHER' ? t('teacher') : t('student')}
                  </Badge>
                )}
                <Button
                  disabled={removeMember.isPending}
                  onClick={() => removeMember.mutate(member.id)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <UserMinus aria-hidden />
                  <span className="sr-only">{t('remove')}</span>
                </Button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            aria-label={t('searchPlaceholder')}
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
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left"
                key={user.id}
                onClick={() => addMember.mutate(user.id)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">
                    {resolveUserFullName(user)}
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
