import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Building } from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { getTranslations } from 'next-intl/server';
import { Suspense, useId } from 'react';
import DefaultWorkspaceSetting from './default-workspace-setting';

interface WorkspaceSettingsCardProps {
  user: WorkspaceUser | null;
}

export default async function WorkspaceSettingsCard({
  user,
}: WorkspaceSettingsCardProps) {
  const t = await getTranslations('settings-account');
  const defaultWorkspaceId = useId();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-purple-100 p-2 dark:bg-purple-900/30">
            <Building className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-lg">{t('workspace')}</CardTitle>
            <CardDescription className="text-sm">
              {t('workspace-settings-description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <label htmlFor={defaultWorkspaceId} className="text-sm font-medium">
            {t('default-workspace')}
          </label>
          <Suspense fallback={<Skeleton className="h-10 w-full" />}>
            <DefaultWorkspaceSetting
              id={defaultWorkspaceId}
              defaultWorkspaceId={user?.default_workspace_id}
            />
          </Suspense>
          <p className="text-xs text-muted-foreground">
            {t('default-workspace-description')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
