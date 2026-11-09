'use client';

import { BarChart3, PieChart, TrendingUp, Users } from '@tuturuuu/icons';
import type { PermissionId, WorkspaceRole } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { permissionGroups } from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

interface PermissionAnalyticsProps {
  wsId: string;
  roles: (WorkspaceRole & { members?: Array<{ id: string }> })[];
  totalMembers: number;
}

export function PermissionAnalytics({
  wsId,
  roles,
  totalMembers,
}: PermissionAnalyticsProps) {
  const t = useTranslations();

  const allPermissions = useMemo(
    () => permissionGroups({ t: t as any, wsId, user: null }),
    [wsId, t]
  );

  // Calculate permission coverage (how many users have each permission)
  const permissionCoverage = useMemo(() => {
    const coverage = new Map<PermissionId, number>();

    // Count users per permission
    roles.forEach((role) => {
      const memberCount = role.members?.length || 0;
      role.permissions
        .filter((p) => p.enabled)
        .forEach((perm) => {
          coverage.set(perm.id, (coverage.get(perm.id) || 0) + memberCount);
        });
    });

    // Convert to array and sort by count
    return Array.from(coverage.entries())
      .map(([permId, count]) => {
        const permInfo = allPermissions
          .flatMap((g) => g.permissions)
          .find((p) => p.id === permId);
        return {
          id: permId,
          title: permInfo?.title || permId,
          count,
          percentage: Math.round((count / Math.max(totalMembers, 1)) * 100),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [roles, allPermissions, totalMembers]);

  // Role distribution
  const roleDistribution = useMemo(() => {
    return roles
      .map((role) => ({
        id: role.id,
        name: role.name,
        memberCount: role.members?.length || 0,
        permissionCount: role.permissions.filter((p) => p.enabled).length,
      }))
      .sort((a, b) => b.memberCount - a.memberCount);
  }, [roles]);

  // Users without roles
  const membersWithRoles = useMemo(() => {
    const uniqueMembers = new Set<string>();
    roles.forEach((role) => {
      role.members?.forEach((m) => {
        uniqueMembers.add(m.id);
      });
    });
    return uniqueMembers.size;
  }, [roles]);

  const membersWithoutRoles = Math.max(0, totalMembers - membersWithRoles);

  // Top and least used permissions
  const topPermissions = permissionCoverage.slice(0, 5);
  const leastPermissions = permissionCoverage.slice(-5).reverse();

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('ws-roles.total_roles')}
            </CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{roles.length}</div>
            <p className="text-muted-foreground text-xs">
              {t('ws-roles.active_roles')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('ws-roles.members_with_roles')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{membersWithRoles}</div>
            <p className="text-muted-foreground text-xs">
              {t('ws-roles.out_of')} {totalMembers}{' '}
              {t('ws-roles.members').toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('ws-roles.without_roles')}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{membersWithoutRoles}</div>
            <p className="text-muted-foreground text-xs">
              {t('ws-roles.default_permissions_only')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {t('ws-roles.avg_permissions')}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {roles.length > 0
                ? Math.round(
                    roles.reduce(
                      (sum, r) =>
                        sum + r.permissions.filter((p) => p.enabled).length,
                      0
                    ) / roles.length
                  )
                : 0}
            </div>
            <p className="text-muted-foreground text-xs">
              {t('ws-roles.per_role')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Role Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>{t('ws-roles.role_distribution')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {roleDistribution.length > 0 ? (
            roleDistribution.map((role) => (
              <div key={role.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{role.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {role.permissionCount}{' '}
                      {t('ws-roles.permissions').toLowerCase()}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground">
                    {role.memberCount} {t('ws-roles.members').toLowerCase()}
                  </span>
                </div>
                <Progress
                  value={(role.memberCount / Math.max(totalMembers, 1)) * 100}
                  className="h-2"
                />
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground text-sm">
              {t('ws-roles.no_roles_created')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Permission Coverage */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('ws-roles.most_used_permissions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topPermissions.length > 0 ? (
              topPermissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <span className="text-sm">{perm.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {perm.count} {t('ws-roles.users').toLowerCase()}
                    </span>
                    <Badge
                      variant="secondary"
                      className="border-dynamic-green/50 bg-dynamic-green/10 text-dynamic-green text-xs"
                    >
                      {perm.percentage}%
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground text-sm">
                {t('ws-roles.no_permissions_data')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('ws-roles.least_used_permissions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leastPermissions.length > 0 ? (
              leastPermissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <span className="text-sm">{perm.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {perm.count} {t('ws-roles.users').toLowerCase()}
                    </span>
                    <Badge
                      variant="secondary"
                      className="border-dynamic-red/50 bg-dynamic-red/10 text-dynamic-red text-xs"
                    >
                      {perm.percentage}%
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground text-sm">
                {t('ws-roles.no_permissions_data')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
