'use client';

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Crown,
  Layers,
  Shield,
  ShieldCheck,
} from '@tuturuuu/icons';
import type { PermissionId } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import {
  permissionGroups,
  totalPermissions,
} from '@tuturuuu/utils/permissions';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface MemberPermissionBreakdownProps {
  wsId: string;
  member: {
    id: string;
    is_creator?: boolean;
    roles?: Array<{
      id: string;
      name: string;
      permissions?: Array<{ permission: string; enabled: boolean }>;
    }>;
    default_permissions?: Array<{ permission: string; enabled: boolean }>;
  };
}

export function MemberPermissionBreakdown({
  wsId,
  member,
}: MemberPermissionBreakdownProps) {
  const t = useTranslations();
  // Start collapsed by default
  const [isOpen, setIsOpen] = useState(false);

  const allPermissions = useMemo(
    () => permissionGroups({ t: t as any, wsId, user: null }),
    [wsId, t]
  );

  const totalPermCount = totalPermissions({ wsId, user: null });

  // Build permission map from groups
  const permissionMap = useMemo(() => {
    const map = new Map<
      PermissionId,
      { icon: any; title: string; description: string }
    >();
    allPermissions.forEach((group) => {
      group.permissions.forEach((perm) => {
        map.set(perm.id, {
          icon: perm.icon,
          title: perm.title,
          description: perm.description,
        });
      });
    });
    return map;
  }, [allPermissions]);

  // Build comprehensive permission analysis with source tracking
  const permissionAnalysis = useMemo(() => {
    // Build map of permission -> sources
    const permSourceMap = new Map<
      string,
      { default: boolean; roles: string[] }
    >();

    // Add default permissions
    member.default_permissions
      ?.filter((p) => p.enabled)
      .forEach((p) => {
        permSourceMap.set(p.permission, { default: true, roles: [] });
      });

    // Add role permissions
    member.roles?.forEach((role) => {
      role.permissions
        ?.filter((p) => p.enabled)
        .forEach((p) => {
          const existing = permSourceMap.get(p.permission);
          if (existing) {
            existing.roles.push(role.name);
          } else {
            permSourceMap.set(p.permission, {
              default: false,
              roles: [role.name],
            });
          }
        });
    });

    // Categorize permissions by source type
    const onlyDefault: string[] = [];
    const onlyRoles: string[] = [];
    const overlap: string[] = [];
    const orphaned: Array<{
      id: string;
      sources: { default: boolean; roles: string[] };
    }> = [];

    permSourceMap.forEach((sources, permId) => {
      // Check if permission exists in current definitions
      const isOrphaned = !permissionMap.has(permId as PermissionId);

      if (isOrphaned) {
        orphaned.push({ id: permId, sources });
      } else if (sources.default && sources.roles.length > 0) {
        overlap.push(permId);
      } else if (sources.default) {
        onlyDefault.push(permId);
      } else if (sources.roles.length > 0) {
        onlyRoles.push(permId);
      }
    });

    return {
      permSourceMap,
      onlyDefault,
      onlyRoles,
      overlap,
      orphaned,
      total: permSourceMap.size,
    };
  }, [member, permissionMap]);

  // Calculate permission stats with proper accounting
  const stats = useMemo(() => {
    const hasAdmin =
      member.default_permissions?.some(
        (p) => p.permission === 'admin' && p.enabled
      ) ||
      member.roles?.some((r) =>
        r.permissions?.some((p) => p.permission === 'admin' && p.enabled)
      );

    // If creator or admin, they have all permissions
    if (member.is_creator || hasAdmin) {
      return {
        total: totalPermCount,
        onlyDefault: permissionAnalysis.onlyDefault.length,
        onlyRoles: permissionAnalysis.onlyRoles.length,
        overlap: permissionAnalysis.overlap.length,
        roleCount: member.roles?.length || 0,
        coverage: 100,
        hasOrphanedPermissions: permissionAnalysis.orphaned.length > 0,
        orphanedCount: permissionAnalysis.orphaned.length,
        isAdmin: hasAdmin,
      };
    }

    // Cap total at maximum available to handle orphaned permissions
    const validPermissionCount =
      permissionAnalysis.total - permissionAnalysis.orphaned.length;
    const actualTotal = Math.min(validPermissionCount, totalPermCount);
    const hasOrphanedPermissions = permissionAnalysis.orphaned.length > 0;

    return {
      total: actualTotal,
      onlyDefault: permissionAnalysis.onlyDefault.length,
      onlyRoles: permissionAnalysis.onlyRoles.length,
      overlap: permissionAnalysis.overlap.length,
      roleCount: member.roles?.length || 0,
      coverage: Math.min(
        100,
        Math.round((validPermissionCount / totalPermCount) * 100)
      ),
      hasOrphanedPermissions,
      orphanedCount: permissionAnalysis.orphaned.length,
    };
  }, [member, totalPermCount, permissionAnalysis]);

  const defaultPermissions = useMemo(
    () =>
      member.default_permissions
        ?.filter((p) => p.enabled)
        .map((p) => p.permission as PermissionId) || [],
    [member.default_permissions]
  );

  return (
    <div className="mt-2 space-y-2">
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="transition-all duration-300"
      >
        <div className="flex items-center justify-between gap-2 rounded-lg bg-accent/50 p-2">
          <div className="flex flex-1 items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-dynamic-blue" />
              <span className="font-medium text-sm">
                {t('ws-members.permissions')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue text-xs"
                  >
                    {stats.total}/{totalPermCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{t('ws-members.total_permissions')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="secondary" className="text-xs">
              {stats.coverage}%
            </Badge>
          </div>
        </div>

        <CollapsibleContent className="mt-2 transition-all duration-300">
          <div className="fade-in-50 slide-in-from-top-2 animate-in space-y-3 rounded-lg border bg-background/50 p-3">
            {/* Coverage Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {t('ws-members.permission_coverage')}
                </span>
                <span className="font-semibold">{stats.coverage}%</span>
              </div>
              <Progress value={stats.coverage} className="h-2" />
            </div>

            <Separator />

            {/* Stats Summary - Fixed accounting */}
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-2.5">
                <div className="font-bold text-dynamic-blue text-lg">
                  {stats.total}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('ws-members.total')}
                </div>
              </div>
              <div className="rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 p-2.5">
                <div className="font-bold text-dynamic-purple text-lg">
                  {stats.onlyDefault}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('ws-members.only_default')}
                </div>
              </div>
              <div className="rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-2.5">
                <div className="font-bold text-dynamic-green text-lg">
                  {stats.onlyRoles}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t('ws-members.only_roles')}
                </div>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-2.5">
                      <div className="font-bold text-dynamic-orange text-lg">
                        {stats.overlap}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t('ws-members.overlap')}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">
                      {t('ws-members.overlap_tooltip')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Redundancy Warning */}
            {stats.overlap > 0 && (
              <div className="rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-dynamic-orange" />
                  <div className="flex-1 space-y-1">
                    <p className="font-medium text-dynamic-orange text-xs">
                      {t('ws-members.redundancy_detected')}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t('ws-members.redundancy_description', {
                        count: stats.overlap,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Orphaned Permissions Warning */}
            {stats.hasOrphanedPermissions && (
              <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-red" />
                  <div className="flex-1 space-y-2">
                    <div className="space-y-1">
                      <p className="font-medium text-dynamic-red text-xs">
                        {t('ws-members.orphaned_permissions_detected')}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {t('ws-members.orphaned_permissions_description', {
                          count: stats.orphanedCount,
                        })}
                      </p>
                    </div>

                    {/* List of orphaned permissions */}
                    <div className="space-y-1.5 rounded-md border border-dynamic-red/20 bg-background/50 p-2">
                      <p className="font-semibold text-[10px] text-muted-foreground uppercase">
                        {t('ws-members.orphaned_permissions_list')}:
                      </p>
                      <div className="space-y-1">
                        {permissionAnalysis.orphaned.map(({ id, sources }) => {
                          const sourceLabels = [
                            sources.default && t('ws-members.default'),
                            ...sources.roles,
                          ].filter(Boolean);

                          return (
                            <div
                              key={id}
                              className="flex items-start gap-2 rounded border border-dynamic-red/20 bg-dynamic-red/5 p-1.5 text-xs"
                            >
                              <code className="flex-1 break-all font-mono text-[10px] text-dynamic-red">
                                {id}
                              </code>
                              <div className="flex flex-wrap gap-1">
                                {sourceLabels.map((label, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className="h-4 border-dynamic-red/50 bg-dynamic-red/10 px-1 text-[9px] text-dynamic-red"
                                  >
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="pt-1 text-[10px] text-muted-foreground italic">
                        {t('ws-members.orphaned_permissions_fix_hint')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            {/* Permission Sources */}
            <div className="space-y-3">
              {/* Creator Status */}
              {member.is_creator && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-dynamic-yellow" />
                    <h4 className="font-semibold text-sm">
                      {t('ws-members.creator_status')}
                    </h4>
                    <Badge className="border-dynamic-yellow/50 bg-dynamic-yellow/10 text-dynamic-yellow text-xs">
                      {t('ws-members.creator_badge')}
                    </Badge>
                  </div>
                  <p className="pl-6 text-muted-foreground text-xs">
                    {t('ws-members.creator_has_all_permissions')}
                  </p>
                </div>
              )}

              {/* Admin Status */}
              {stats.isAdmin && !member.is_creator && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-dynamic-green" />
                    <h4 className="font-semibold text-sm">
                      {t('ws-members.admin_status')}
                    </h4>
                    <Badge className="border-dynamic-green/50 bg-dynamic-green/10 text-dynamic-green text-xs">
                      {t('ws-members.admin_badge')}
                    </Badge>
                  </div>
                  <p className="pl-6 text-muted-foreground text-xs">
                    {t('ws-members.admin_has_all_permissions')}
                  </p>
                </div>
              )}

              {/* Overlap Permissions - Show first if they exist */}
              {stats.overlap > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-dynamic-orange" />
                    <h4 className="font-semibold text-sm">
                      {t('ws-members.overlapping_permissions')}
                    </h4>
                    <Badge className="border-dynamic-orange/50 bg-dynamic-orange/10 text-dynamic-orange text-xs">
                      {stats.overlap}
                    </Badge>
                  </div>
                  <div className="space-y-1 pl-6">
                    {permissionAnalysis.overlap.map((permId) => {
                      const perm = permissionMap.get(permId as PermissionId);
                      const sources =
                        permissionAnalysis.permSourceMap.get(permId);
                      if (!perm || !sources) return null;

                      const sourceLabels = [
                        sources.default && t('ws-members.default'),
                        ...sources.roles,
                      ].filter(Boolean);

                      return (
                        <TooltipProvider key={permId}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 rounded-md border border-dynamic-orange/20 bg-dynamic-orange/5 p-1.5 text-xs transition-colors hover:bg-dynamic-orange/10">
                                {perm.icon && (
                                  <div className="text-dynamic-orange">
                                    {perm.icon}
                                  </div>
                                )}
                                <span className="flex-1 truncate">
                                  {perm.title}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="h-4 border-dynamic-orange/50 bg-dynamic-orange/10 px-1 text-[10px] text-dynamic-orange"
                                >
                                  {sourceLabels.length}×
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <div className="space-y-2">
                                <p className="font-semibold text-xs">
                                  {perm.description}
                                </p>
                                <Separator />
                                <div className="space-y-1">
                                  <p className="font-semibold text-[10px] text-muted-foreground uppercase">
                                    {t('ws-members.granted_by')}:
                                  </p>
                                  {sourceLabels.map((label, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-1.5"
                                    >
                                      <div className="h-1 w-1 rounded-full bg-dynamic-orange" />
                                      <span className="text-xs">{label}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Default Permissions */}
              {defaultPermissions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-dynamic-blue" />
                    <h4 className="font-semibold text-sm">
                      {t('ws-members.default_permissions')}
                    </h4>
                    <Badge className="border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue text-xs">
                      {defaultPermissions.length}
                    </Badge>
                    {stats.overlap > 0 &&
                      permissionAnalysis.onlyDefault.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          ({permissionAnalysis.onlyDefault.length}{' '}
                          {t('ws-members.unique')})
                        </span>
                      )}
                  </div>
                  <div className="space-y-1 pl-6">
                    {defaultPermissions.map((permId) => {
                      const perm = permissionMap.get(permId);
                      const sources =
                        permissionAnalysis.permSourceMap.get(permId);
                      if (!perm) return null;

                      // Skip if shown in overlap section
                      if (sources?.roles && sources.roles.length > 0)
                        return null;

                      return (
                        <TooltipProvider key={permId}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 rounded-md p-1.5 text-xs transition-colors hover:bg-accent">
                                {perm.icon && (
                                  <div className="text-dynamic-blue">
                                    {perm.icon}
                                  </div>
                                )}
                                <span className="flex-1 truncate">
                                  {perm.title}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <p className="text-xs">{perm.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Role Permissions */}
              {member.roles && member.roles.length > 0 && (
                <div className="space-y-3">
                  {member.roles.map((role) => {
                    const rolePermissions =
                      role.permissions?.filter((p) => p.enabled) || [];

                    // Count unique permissions for this role (not in overlap)
                    const uniqueInRole = rolePermissions.filter((p) => {
                      const sources = permissionAnalysis.permSourceMap.get(
                        p.permission
                      );
                      return !sources?.default && sources?.roles.length === 1;
                    }).length;

                    return (
                      <div key={role.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-dynamic-purple" />
                          <h4 className="font-semibold text-sm">
                            {t('ws-members.role')}: {role.name}
                          </h4>
                          <Badge className="border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple text-xs">
                            {rolePermissions.length}
                          </Badge>
                          {stats.overlap > 0 &&
                            uniqueInRole > 0 &&
                            uniqueInRole < rolePermissions.length && (
                              <span className="text-[10px] text-muted-foreground">
                                ({uniqueInRole} {t('ws-members.unique')})
                              </span>
                            )}
                        </div>
                        <div className="space-y-1 pl-6">
                          {rolePermissions.map((perm) => {
                            const permInfo = permissionMap.get(
                              perm.permission as PermissionId
                            );
                            const sources =
                              permissionAnalysis.permSourceMap.get(
                                perm.permission
                              );
                            if (!permInfo) return null;

                            // Skip if shown in overlap section
                            if (
                              sources?.default ||
                              (sources?.roles && sources.roles.length > 1)
                            ) {
                              return null;
                            }

                            return (
                              <TooltipProvider key={perm.permission}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 rounded-md p-1.5 text-xs transition-colors hover:bg-accent">
                                      {permInfo.icon && (
                                        <div className="text-dynamic-purple">
                                          {permInfo.icon}
                                        </div>
                                      )}
                                      <span className="flex-1 truncate">
                                        {permInfo.title}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="right"
                                    className="max-w-xs"
                                  >
                                    <p className="text-xs">
                                      {permInfo.description}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* No Permissions */}
              {!member.is_creator &&
                defaultPermissions.length === 0 &&
                (!member.roles || member.roles.length === 0) && (
                  <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
                    <p className="text-muted-foreground text-xs">
                      {t('ws-members.no_permissions')}
                    </p>
                  </div>
                )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
