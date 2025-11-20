'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import DefaultWorkspaceSetting from './default-workspace-setting';

interface WorkspaceSettingsCardProps {
  user: WorkspaceUser | null;
}

export default function WorkspaceSettingsCard({
  user,
}: WorkspaceSettingsCardProps) {
  const t = useTranslations('settings-account');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">{t('workspace')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('workspace-settings-description')}
        </p>
      </div>
      <div className="rounded-lg border p-4">
        <div className="space-y-4">
          <div className="space-y-3">
            <label className="font-medium text-sm">
              {t('default-workspace')}
            </label>
            <Suspense fallback={<Skeleton className="h-10 w-full" />}>
              <DefaultWorkspaceSetting
                defaultWorkspaceId={user?.default_workspace_id}
              />
            </Suspense>
            <p className="text-muted-foreground text-xs">
              {t('default-workspace-description')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
