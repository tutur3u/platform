import {
  CalendarIcon,
  ChartColumn,
  FileUser,
  UserCheck,
  Users,
} from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { cn } from '@tuturuuu/utils/format';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface UserGroupQuickActionsProps {
  wsId: string;
}

export default async function UserGroupQuickActions({
  wsId,
}: UserGroupQuickActionsProps) {
  // Check if the feature is enabled via workspace secret
  const featureEnabled = await checkFeatureEnabled(wsId);

  if (!featureEnabled) {
    return null;
  }

  const t = await getTranslations();
  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  const canViewUserGroups = containsPermission('view_user_groups');
  const canCheckUserAttendance = containsPermission('check_user_attendance');
  const canViewUserGroupsScores = containsPermission('view_user_groups_scores');

  if (!canViewUserGroups) {
    return null;
  }

  const quickActions = [
    {
      href: `/${wsId}/users/groups/~/schedule`,
      icon: CalendarIcon,
      label: t('dashboard.quick_actions.schedule'),
      description: t('dashboard.quick_actions.schedule_desc'),
      color: 'blue',
      enabled: true,
    },
    {
      href: `/${wsId}/users/groups/~/attendance`,
      icon: UserCheck,
      label: t('dashboard.quick_actions.attendance'),
      description: t('dashboard.quick_actions.attendance_desc'),
      color: 'purple',
      enabled: canCheckUserAttendance,
    },
    {
      href: `/${wsId}/users/groups/~/indicators`,
      icon: ChartColumn,
      label: t('dashboard.quick_actions.indicators'),
      description: t('dashboard.quick_actions.indicators_desc'),
      color: 'red',
      enabled: canViewUserGroupsScores,
    },
    {
      href: `/${wsId}/users/groups/~/reports`,
      icon: FileUser,
      label: t('dashboard.quick_actions.reports'),
      description: t('dashboard.quick_actions.reports_desc'),
      color: 'green',
      enabled: true,
    },
  ].filter((action) => action.enabled);

  if (quickActions.length === 0) {
    return null;
  }

  return (
    <div className="col-span-full">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-blue/10">
          <Users className="h-5 w-5 text-dynamic-blue" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">
            {t('dashboard.user_group_quick_actions')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t('dashboard.user_group_quick_actions_desc')}
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href} className="group">
            <div
              className={cn(
                'h-full rounded-lg border p-4 transition-all hover:shadow-md',
                `border-dynamic-${action.color}/20 bg-dynamic-${action.color}/5 hover:bg-dynamic-${action.color}/10`
              )}
            >
              <div className="mb-3 flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                    `bg-dynamic-${action.color}/10 text-dynamic-${action.color} group-hover:bg-dynamic-${action.color}/20`
                  )}
                >
                  <action.icon className="h-5 w-5" />
                </div>
              </div>
              <h3
                className={cn(
                  'mb-1 font-semibold',
                  `text-dynamic-${action.color}`
                )}
              >
                {action.label}
              </h3>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {action.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

async function checkFeatureEnabled(wsId: string): Promise<boolean> {
  try {
    const sbAdmin = await createAdminClient();

    const { data } = await sbAdmin
      .from('workspace_secrets')
      .select('value')
      .eq('ws_id', wsId)
      .eq('name', 'SHOW_USER_GROUP_QUICK_ACTIONS_IN_DASHBOARD')
      .maybeSingle();

    return data?.value === 'true';
  } catch {
    return false;
  }
}
