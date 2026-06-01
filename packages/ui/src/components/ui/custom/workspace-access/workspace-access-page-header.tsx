'use client';

import { Users } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import type { WorkspaceAccessContext, WorkspaceAccessMode } from './types';

type Props = {
  context: WorkspaceAccessContext;
  invitedCount: number;
  joinedCount: number;
  mode: WorkspaceAccessMode;
  totalCount: number;
};

export function WorkspaceAccessPageHeader({
  context,
  invitedCount,
  joinedCount,
  mode,
  totalCount,
}: Props) {
  const t = useTranslations() as (key: string) => string;

  return (
    <section className="rounded-lg border bg-background p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-foreground text-background">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-semibold text-2xl tracking-tight">
                {mode === 'cms'
                  ? t('external-projects.settings.members_title')
                  : t('workspace-settings-layout.members')}
              </h1>
              {context.boundProjectName ? (
                <p className="mt-1 text-muted-foreground text-sm">
                  {t('external-projects.settings.bound_project_label')}:{' '}
                  {context.boundProjectName}
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-muted-foreground text-sm leading-6">
            {mode === 'cms'
              ? t('external-projects.settings.members_description')
              : t('ws-members.description')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full">
            {t('common.total')}: {totalCount}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {t('ws-members.active_members')}: {joinedCount}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {t('ws-members.pending_invitations')}: {invitedCount}
          </Badge>
        </div>
      </div>
    </section>
  );
}
