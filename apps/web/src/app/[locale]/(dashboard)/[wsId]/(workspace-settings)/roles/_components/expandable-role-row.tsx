'use client';

import { ChevronDown, ChevronRight, Edit, User, Users } from '@tuturuuu/icons';
import type { WorkspaceRole } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { getInitials } from '@tuturuuu/utils/name-helper';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ExpandableRoleRowProps {
  role: WorkspaceRole & { ws_id: string };
  permissionsCount: number;
  onManageMembers?: () => void;
  onEditRole?: () => void;
}

export function ExpandableRoleRow({
  role,
  permissionsCount,
  onManageMembers,
  onEditRole,
}: ExpandableRoleRowProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const members = role.members || [];
  const visibleMembers = members.slice(0, 12);
  const remainingCount = Math.max(0, members.length - 12);
  const enabledPermissions = role.permissions.filter((p) => p.enabled).length;

  if (members.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-50"
        disabled
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-4 rounded-lg border bg-background/50 p-4">
          {/* Header with Quick Stats */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">
                {t('ws-roles.users_with_role')}
              </h4>
              <p className="text-muted-foreground text-xs">
                {members.length}{' '}
                {members.length === 1
                  ? t('ws-roles.member')
                  : t('ws-roles.members')}{' '}
                • {enabledPermissions}/{permissionsCount}{' '}
                {t('ws-roles.permissions').toLowerCase()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onManageMembers && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManageMembers();
                  }}
                >
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  <span className="text-xs">
                    {t('ws-roles.manage_members')}
                  </span>
                </Button>
              )}
              {onEditRole && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditRole();
                  }}
                >
                  <Edit className="mr-1.5 h-3.5 w-3.5" />
                  <span className="text-xs">{t('common.edit')}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Avatar Grid */}
          {members.length > 0 ? (
            <div className="space-y-2">
              <TooltipProvider delayDuration={300}>
                <div className="flex flex-wrap gap-2">
                  {visibleMembers.map((member) => (
                    <Tooltip key={member.id}>
                      <TooltipTrigger asChild>
                        <div className="cursor-pointer transition-transform hover:scale-110">
                          <Avatar className="h-9 w-9 ring-2 ring-background">
                            <AvatarImage src={member.avatar_url ?? undefined} />
                            <AvatarFallback className="text-xs">
                              {member.display_name ? (
                                getInitials(member.display_name)
                              ) : (
                                <User className="h-4 w-4" />
                              )}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-1">
                          <p className="font-semibold text-sm">
                            {member.display_name || t('common.unnamed')}
                          </p>
                          {member.email && (
                            <p className="text-muted-foreground text-xs">
                              {member.email}
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {remainingCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted ring-2 ring-background">
                          <span className="font-semibold text-muted-foreground text-xs">
                            +{remainingCount}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          {remainingCount} {t('ws-roles.more_members')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TooltipProvider>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">
                {t('ws-roles.no_users_assigned')}
              </p>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-1 gap-2 border-t pt-3 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-lg bg-dynamic-blue/5 p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-dynamic-blue/20">
                <Users className="h-4 w-4 text-dynamic-blue" />
              </div>
              <div>
                <p className="font-semibold text-xs">{members.length}</p>
                <p className="text-muted-foreground text-xs">
                  {t('ws-roles.members')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-dynamic-purple/5 p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-dynamic-purple/20">
                <span className="font-bold text-dynamic-purple text-xs">
                  {enabledPermissions}
                </span>
              </div>
              <div>
                <p className="font-semibold text-xs">
                  {enabledPermissions}/{permissionsCount}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('ws-roles.permissions')}
                </p>
              </div>
            </div>
            {role.created_at && (
              <div className="flex items-center gap-2 rounded-lg bg-dynamic-green/5 p-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-dynamic-green/20">
                  <span className="font-bold text-dynamic-green text-xs">
                    {moment(role.created_at).format('DD')}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-xs">
                    {moment(role.created_at).format('MMM YYYY')}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('common.created')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
