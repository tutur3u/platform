'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaceTaskProjects } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function useTaskPlanProject(wsId: string) {
  const [enabled, setEnabled] = useState(false);
  const [projectId, setProjectId] = useState('');
  const query = useQuery({
    queryKey: ['task-plan-projects', wsId],
    queryFn: () => listWorkspaceTaskProjects(wsId),
    enabled,
    retry: false,
  });
  const selected = enabled
    ? query.data?.find((project) => project.id === projectId)
    : undefined;
  return {
    enabled,
    setEnabled,
    projectId,
    setProjectId,
    query,
    selected,
    canSubmit: !enabled || (!!selected && !query.isError && !query.isFetching),
  };
}

export function TaskPlanProject({
  plan,
}: {
  plan: ReturnType<typeof useTaskPlanProject>;
}) {
  const t = useTranslations('task-plan');
  return (
    <div className="space-y-2 rounded-md border border-border p-4">
      <label className="flex gap-3">
        <input
          type="checkbox"
          name="projectAssociation"
          checked={plan.enabled}
          onChange={(event) => plan.setEnabled(event.target.checked)}
        />
        <span>{t('attachProject')}</span>
      </label>
      <p className="text-muted-foreground text-sm">{t('projectConsent')}</p>
      {plan.enabled && (
        <>
          {plan.query.isFetching && <p role="status">{t('projectsLoading')}</p>}
          {plan.query.isError && (
            <div role="alert">
              <p>{t('projectsFailed')}</p>
              <Button type="button" onClick={() => plan.query.refetch()}>
                {t('retry')}
              </Button>
            </div>
          )}
          {!plan.query.isFetching &&
            !plan.query.isError &&
            plan.query.data?.length === 0 && <p>{t('noProjects')}</p>}
          <label className="block space-y-2">
            {t('project')}
            <select
              className="w-full rounded-md border border-input bg-background p-2"
              name="projectId"
              value={plan.projectId}
              required
              disabled={plan.query.isError || plan.query.isFetching}
              onChange={(event) => plan.setProjectId(event.target.value)}
            >
              <option value="">{t('chooseProject')}</option>
              {plan.query.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
