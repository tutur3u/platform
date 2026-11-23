'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMeetingProjectLinks,
  linkMeetingProject,
  type MeetingProjectLinks,
  unlinkMeetingProject,
} from '@tuturuuu/internal-api';
import { ProjectChip } from '@tuturuuu/ui/custom/project-chip';
import { ProjectPicker } from '@tuturuuu/ui/custom/project-picker';
import { LoadingRegion, SkeletonLine } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

export const meetingProjectsQueryKey = (wsId: string, meetingId: string) =>
  ['meeting-record-projects', wsId, meetingId] as const;

export function projectHref(
  tasksUrl: string,
  workspaceSlug: string,
  projectId: string
) {
  return `${tasksUrl}/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}`;
}

/** The Projects a meeting belongs to, with linking for project managers. */
export function MeetingProjects({
  wsId,
  meetingId,
  workspaceSlug,
  tasksUrl,
}: {
  wsId: string;
  meetingId: string;
  workspaceSlug: string;
  tasksUrl: string;
}) {
  const t = useTranslations('meet.record.projects');
  const queryClient = useQueryClient();
  const queryKey = meetingProjectsQueryKey(wsId, meetingId);
  const links = useQuery({
    queryKey,
    queryFn: () => getMeetingProjectLinks(wsId, meetingId),
  });
  const change = useMutation({
    mutationFn: ({ projectId, link }: { projectId: string; link: boolean }) =>
      (link ? linkMeetingProject : unlinkMeetingProject)(
        wsId,
        meetingId,
        projectId
      ),
    onSuccess: ({ linked }) =>
      queryClient.setQueryData<MeetingProjectLinks>(queryKey, (current) =>
        current ? { ...current, linked } : current
      ),
    onError: () => toast.error(t('change_failed')),
  });
  const linkedIds = useMemo(
    () => new Set((links.data?.linked ?? []).map((project) => project.id)),
    [links.data]
  );

  if (links.isPending)
    return (
      <LoadingRegion className="w-40" srLabel={t('loading')}>
        <SkeletonLine size="sm" barClassName="w-full" />
      </LoadingRegion>
    );
  if (links.isError)
    return <p className="text-muted-foreground text-sm">{t('unavailable')}</p>;

  const { linked, available, canLink } = links.data;
  if (!canLink && linked.length === 0) return null;

  return (
    <div
      aria-label={t('label')}
      className="flex flex-wrap items-center gap-2"
      role="group"
    >
      {linked.map((project) => (
        <ProjectChip
          key={project.id}
          disabled={change.isPending}
          href={projectHref(tasksUrl, workspaceSlug, project.id)}
          name={project.name}
          onRemove={
            canLink
              ? () => change.mutate({ projectId: project.id, link: false })
              : undefined
          }
          removeLabel={t('unlink', { name: project.name })}
        />
      ))}
      {canLink ? (
        <ProjectPicker
          className="w-56"
          disabled={change.isPending}
          labels={{
            placeholder: linked.length ? t('add_another') : t('placeholder'),
            search: t('search'),
            empty: t('empty'),
            clear: t('clear'),
            loading: t('loading'),
          }}
          onChange={(projectId) => {
            if (projectId) change.mutate({ projectId, link: true });
          }}
          state={{
            status: 'ready',
            projects: available.filter((project) => !linkedIds.has(project.id)),
          }}
          value={null}
        />
      ) : null}
    </div>
  );
}
