'use client';

import { ShieldCheck, Users } from '@tuturuuu/icons';
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
    <section className="overflow-hidden rounded-xl border border-border bg-linear-to-br from-background via-background to-foreground/[0.02] p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-blue to-dynamic-purple shadow-lg">
              <Users className="h-6 w-6 text-background" />
            </div>
            <div className="min-w-0">
              <h1 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-bold text-3xl text-transparent tracking-tight">
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

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Badge variant="outline" className="rounded-full">
            {t('common.total')}: {totalCount}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {t('ws-members.active_members')}: {joinedCount}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {t('ws-members.pending_invitations')}: {invitedCount}
          </Badge>
          <Badge variant="secondary" className="gap-1 rounded-full">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('ws-roles.plural')}
          </Badge>
        </div>
      </div>
    </section>
  );
}
