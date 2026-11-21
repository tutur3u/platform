'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEPLOY_ENVIRONMENTS,
  type DeployAction,
  type DeployEnvironmentName,
  getDeployProject,
  runDeployAction,
} from '@tuturuuu/internal-api/infrastructure';
import { RefreshCw } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  DeploymentActionDialog,
  type PendingAction,
} from './deployment-action-dialog';
import { DeploymentEnvironment } from './deployment-environment';
import { projectView } from './deployment-view';

// Reads are on demand (mount, focus, refresh, after an action) rather than
// polled: coordinator reads stay outside its daily call budget, so the
// dashboard does not add a standing request rate.
export function DeploymentProject({
  projectId,
  canOperate,
}: {
  projectId: string;
  canOperate: boolean;
}) {
  const t = useTranslations('deployments');
  const cache = useQueryClient();
  const queryKey = ['infrastructure', 'deployments', projectId];
  const query = useQuery({
    queryKey,
    queryFn: () => getDeployProject(projectId),
    retry: false,
  });
  const [pending, setPending] = useState<PendingAction | null>(null);
  const mutation = useMutation({
    mutationFn: ({
      environment,
      action,
    }: {
      environment: DeployEnvironmentName;
      action: DeployAction;
    }) => runDeployAction(projectId, environment, action),
    onSuccess: () => {
      toast.success(t('action_success'));
      setPending(null);
    },
    onError: (error) =>
      toast.error(
        t('action_failed', {
          code: error instanceof Error ? error.message : String(error),
        })
      ),
    onSettled: () => cache.invalidateQueries({ queryKey }),
  });
  const view = projectView(query);

  switch (view.kind) {
    case 'loading':
      return (
        <div className="space-y-6" aria-busy="true">
          {DEPLOY_ENVIRONMENTS.map((environment) => (
            <Skeleton key={environment} className="h-32 w-full" />
          ))}
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
        <p className="text-muted-foreground text-sm">
          {t('unconfigured.description')}
        </p>
      );
    case 'ready':
      return (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              {t(`providers.${view.data.project.provider}`)}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={view.refreshing}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                className={view.refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
              />
              {t('refresh')}
            </Button>
          </div>
          {DEPLOY_ENVIRONMENTS.map((environment) => (
            <DeploymentEnvironment
              key={environment}
              environment={environment}
              result={view.data.environments[environment]}
              canOperate={canOperate}
              onAction={setPending}
            />
          ))}
          <DeploymentActionDialog
            pending={pending}
            submitting={mutation.isPending}
            onClose={() => setPending(null)}
            onSubmit={(environment, action) =>
              mutation.mutate({ environment, action })
            }
          />
        </div>
      );
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}
