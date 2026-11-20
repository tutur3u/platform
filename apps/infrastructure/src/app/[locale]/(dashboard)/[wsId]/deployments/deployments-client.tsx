'use client';

import { useQuery } from '@tanstack/react-query';
import { getDeployProjects } from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DeploymentProject } from './deployment-project';
import { projectsView } from './deployment-view';

export function DeploymentsClient({ canOperate }: { canOperate: boolean }) {
  const t = useTranslations('deployments');
  const query = useQuery({
    queryKey: ['infrastructure', 'deployments'],
    queryFn: () => getDeployProjects(),
    retry: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const view = projectsView(query);

  return (
    <div className="space-y-8">
      <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
      {(() => {
        switch (view.kind) {
          case 'loading':
            return (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-40 w-full" />
              </div>
            );
          case 'error':
            return (
              <div
                role="alert"
                className="space-y-3 rounded-lg border bg-card px-4 py-4 md:px-5"
              >
                <p className="text-sm">{t('load_error')}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void query.refetch()}
                >
                  {t('retry')}
                </Button>
              </div>
            );
          case 'unconfigured':
            return (
              <div className="space-y-2 rounded-lg border bg-card px-4 py-4 md:px-5">
                <p className="font-medium text-sm">{t('unconfigured.title')}</p>
                <p className="text-muted-foreground text-sm">
                  {t('unconfigured.description')}
                </p>
              </div>
            );
          case 'empty':
            return (
              <p className="text-muted-foreground text-sm">
                {t('no_projects')}
              </p>
            );
          case 'ready': {
            const project =
              view.projects.find((entry) => entry.id === selected) ??
              view.projects[0]!;
            return (
              <>
                <Label className="max-w-xs space-y-2">
                  {t('project')}
                  <Select value={project.id} onValueChange={setSelected}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {view.projects.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Label>
                <DeploymentProject
                  key={project.id}
                  projectId={project.id}
                  canOperate={canOperate}
                />
              </>
            );
          }
          default: {
            const exhaustive: never = view;
            return exhaustive;
          }
        }
      })()}
    </div>
  );
}
