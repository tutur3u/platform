'use client';

import {
  KeyRound,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function CmsMembersHeader({
  activeMembers,
  boundProjectName,
  canManageRoles,
  invitedMembers,
  membersWithRoles,
  roleAssignableMembers,
  totalMembers,
}: {
  activeMembers: number;
  boundProjectName?: string | null;
  canManageRoles: boolean;
  invitedMembers: number;
  membersWithRoles: number;
  roleAssignableMembers: number;
  totalMembers: number;
}) {
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');
  const roleCoverage =
    roleAssignableMembers > 0
      ? Math.round((membersWithRoles / roleAssignableMembers) * 100)
      : 0;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-gradient-to-br from-background via-background to-dynamic-blue/5 shadow-sm">
      <div className="absolute top-0 -left-10 h-40 w-40 rounded-full bg-dynamic-blue/10 blur-3xl" />
      <div className="absolute right-0 bottom-0 h-48 w-48 rounded-full bg-dynamic-orange/10 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-6 p-6 lg:p-8">
        <div className="max-w-3xl space-y-4">
          <Badge
            variant="secondary"
            className="rounded-full border border-border/60 bg-background/80 px-3 py-1"
          >
            {t('common.members')}
          </Badge>
          <div className="space-y-3">
            <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
              {tSettings('members_title')}
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm leading-6 md:text-base">
              {tSettings('members_description')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <SummaryPill
              icon={<Users className="h-3.5 w-3.5" />}
              label={t('common.total')}
              value={totalMembers}
            />
            <SummaryPill
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label={t('ws-members.active_members')}
              value={activeMembers}
            />
            <SummaryPill
              icon={<UserPlus className="h-3.5 w-3.5" />}
              label={t('ws-members.pending_invitations')}
              value={invitedMembers}
            />
            <SummaryPill
              icon={<KeyRound className="h-3.5 w-3.5" />}
              label={tSettings('role_coverage_label')}
              value={`${membersWithRoles}/${roleAssignableMembers || 0}`}
            />
          </div>
        </div>

        <div className="grid min-w-[280px] flex-1 gap-3 sm:grid-cols-2 xl:max-w-[34rem]">
          <Card className="border-border/70 bg-background/85 shadow-none backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {tSettings('bound_project_label')}
                </div>
                <Sparkles className="h-4 w-4 text-dynamic-blue" />
              </div>
              <div className="mt-3 font-semibold text-lg">
                {boundProjectName || t('external-projects.root.unbound_label')}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-background/85 shadow-none backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {tSettings('member_access_label')}
                </div>
                <ShieldCheck className="h-4 w-4 text-dynamic-blue" />
              </div>
              <div className="mt-3 font-semibold text-lg">
                {canManageRoles
                  ? tSettings('member_access_managed')
                  : tSettings('member_access_read_only')}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-background/85 shadow-none backdrop-blur">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {tSettings('role_coverage_label')}
                </div>
                <KeyRound className="h-4 w-4 text-dynamic-blue" />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="font-semibold text-lg">
                  {tSettings('role_coverage_value', {
                    assigned: membersWithRoles,
                    total: roleAssignableMembers,
                  })}
                </div>
                <div className="text-muted-foreground text-sm">
                  {roleCoverage}%
                </div>
              </div>
              <Progress
                className="h-2 bg-dynamic-blue/10"
                indicatorClassName="bg-dynamic-blue"
                value={roleCoverage}
              />
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-background/85 shadow-none backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {t('ws-members.pending_invitations')}
                </div>
                <UserPlus className="h-4 w-4 text-dynamic-orange" />
              </div>
              <div
                className={cn(
                  'mt-3 font-semibold text-lg',
                  invitedMembers > 0 ? 'text-dynamic-orange' : undefined
                )}
              >
                {invitedMembers}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function SummaryPill({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/75 px-3 py-1.5 text-sm shadow-sm backdrop-blur">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
