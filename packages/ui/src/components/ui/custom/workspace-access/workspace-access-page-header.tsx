'use client';

import { ShieldCheck, UserCheck, UserPlus, Users } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { WorkspaceAccessContext, WorkspaceAccessMode } from './types';

type Props = {
  context: WorkspaceAccessContext;
  invitedCount: number;
  joinedCount: number;
  mode: WorkspaceAccessMode;
  totalCount: number;
};

type Stat = {
  accent: string;
  icon: ReactNode;
  label: string;
  value: number;
};

export function WorkspaceAccessPageHeader({
  context,
  invitedCount,
  joinedCount,
  mode,
  totalCount,
}: Props) {
  const t = useTranslations() as (key: string) => string;

  const stats: Stat[] = [
    {
      accent: 'text-dynamic-blue',
      icon: <Users className="h-4 w-4" />,
      label: t('ws-members.total'),
      value: totalCount,
    },
    {
      accent: 'text-dynamic-green',
      icon: <UserCheck className="h-4 w-4" />,
      label: t('ws-members.active_members'),
      value: joinedCount,
    },
    {
      accent: 'text-dynamic-orange',
      icon: <UserPlus className="h-4 w-4" />,
      label: t('ws-members.pending_invitations'),
      value: invitedCount,
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-background">
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-bold text-2xl tracking-tight">
                {mode === 'cms'
                  ? t('external-projects.settings.members_title')
                  : t('workspace-settings-layout.members')}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-dynamic-purple/30 bg-dynamic-purple/10 px-2 py-0.5 font-medium text-dynamic-purple text-xs">
                <ShieldCheck className="h-3 w-3" />
                {t('ws-roles.plural')}
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-muted-foreground text-sm leading-6">
              {mode === 'cms'
                ? t('external-projects.settings.members_description')
                : t('ws-members.description')}
            </p>
            {context.boundProjectName ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-foreground/[0.03] px-2 py-1 text-muted-foreground text-xs">
                {t('external-projects.settings.bound_project_label')}:
                <span className="font-semibold text-foreground">
                  {context.boundProjectName}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-foreground/[0.02]">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 px-4 py-3 text-center"
            >
              <span
                className={`inline-flex items-center justify-center gap-1.5 ${stat.accent}`}
              >
                {stat.icon}
                <span className="font-bold text-foreground text-xl tabular-nums">
                  {stat.value}
                </span>
              </span>
              <span className="text-muted-foreground text-xs">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
