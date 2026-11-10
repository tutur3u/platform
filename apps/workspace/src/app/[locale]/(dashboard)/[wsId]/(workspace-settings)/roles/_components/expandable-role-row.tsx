'use client';

import { ChevronDown, ChevronRight, Edit, User, Users } from '@tuturuuu/icons';
import type { WorkspaceRole } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
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
  const visibleMembers = members.slice(0, 6);
  const remainingCount = Math.max(0, members.length - visibleMembers.length);
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
        <div className="mt-2 space-y-4 rounded-2xl border border-border bg-linear-to-br from-background via-background to-foreground/[0.02] p-4 shadow-sm">
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

          {/* Member Preview */}
          {members.length > 0 ? (
            <div className="space-y-2">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background/80 p-3 transition-colors hover:border-foreground/15 hover:bg-background"
                  >
                    <Avatar className="h-11 w-11 ring-2 ring-background">
                      <AvatarImage src={member.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {member.display_name ? (
                          getInitials(member.display_name)
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate font-medium text-sm">
                        {member.display_name || t('common.unnamed')}
                      </p>
                      <p className="truncate text-muted-foreground text-xs">
                        {member.email || member.id}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {remainingCount > 0 ? (
                <Badge
                  variant="secondary"
                  className="rounded-full px-3 py-1 font-medium text-xs"
                >
                  +{remainingCount} {t('ws-roles.more_members')}
                </Badge>
              ) : null}
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
