'use client';

import { KeyRound, ListFilter, ShieldCheck, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { getMemberFilterOptions } from './member-filter-utils';
import type {
  MemberFiltersState,
  WorkspaceAccessLabels,
  WorkspaceAccessMemberStatus,
} from './types';

type Props = {
  filterOptions: ReturnType<typeof getMemberFilterOptions>;
  filters: MemberFiltersState;
  labels: WorkspaceAccessLabels;
  onFiltersChange: (filters: MemberFiltersState) => void;
  onStatusChange: (status: WorkspaceAccessMemberStatus) => void;
  status: WorkspaceAccessMemberStatus;
};

function toggleValue(values: string[], value: string, checked: boolean) {
  const next = new Set(values);
  if (checked) next.add(value);
  else next.delete(value);
  return [...next];
}

export function WorkspaceAccessPeopleFilters({
  filterOptions,
  filters,
  labels,
  onFiltersChange,
  onStatusChange,
  status,
}: Props) {
  const t = useTranslations() as (key: string) => string;
  const hasFilters =
    filters.permissionIds.length > 0 || filters.roleIds.length > 0;
  const activeFilterCount =
    filters.permissionIds.length + filters.roleIds.length;

  return (
    <div className="grid gap-2 rounded-xl border border-border bg-foreground/[0.02] p-2.5 sm:p-3">
      <div className="grid min-w-0 gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="hidden items-center gap-2 text-muted-foreground text-sm sm:flex">
          <ListFilter className="h-4 w-4" />
          <span className="font-medium">{t('ws-members.filters')}</span>
        </div>

        <Tabs
          className="w-full sm:w-auto"
          value={status}
          onValueChange={(value) =>
            onStatusChange(value as WorkspaceAccessMemberStatus)
          }
        >
          <TabsList className="grid h-9 w-full grid-cols-3 p-1 sm:w-auto">
            <TabsTrigger className="h-full min-h-0" value="all">
              {t('ws-members.all')}
            </TabsTrigger>
            <TabsTrigger className="h-full min-h-0" value="joined">
              {t('ws-members.joined')}
            </TabsTrigger>
            <TabsTrigger className="h-full min-h-0" value="invited">
              {t('ws-members.invited')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-0 flex-1 gap-1.5 border-dashed bg-background/60 px-2 sm:flex-none sm:px-3"
              disabled={filterOptions.roles.length === 0}
            >
              <ShieldCheck className="h-4 w-4 text-dynamic-purple" />
              <span className="truncate sm:max-w-36">
                {labels.filterByRole}
              </span>
              {filters.roleIds.length > 0 ? (
                <>
                  <Separator className="mx-1 h-4" orientation="vertical" />
                  <Badge
                    className="rounded-sm px-1 font-normal"
                    variant="secondary"
                  >
                    {filters.roleIds.length}
                  </Badge>
                </>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{labels.accessLevelsLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {filterOptions.roles.length === 0 ? (
              <div className="px-2 py-1.5 text-muted-foreground text-sm">
                {labels.rolesEmptyTitle}
              </div>
            ) : (
              filterOptions.roles.map((role) => (
                <DropdownMenuCheckboxItem
                  key={role.id}
                  checked={filters.roleIds.includes(role.id)}
                  onCheckedChange={(checked) =>
                    onFiltersChange({
                      ...filters,
                      roleIds: toggleValue(
                        filters.roleIds,
                        role.id,
                        Boolean(checked)
                      ),
                    })
                  }
                >
                  {role.name} ({role.count})
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-0 flex-1 gap-1.5 border-dashed bg-background/60 px-2 sm:flex-none sm:px-3"
              disabled={filterOptions.permissions.length === 0}
            >
              <KeyRound className="h-4 w-4 text-dynamic-blue" />
              <span className="truncate sm:max-w-44">
                {labels.filterByPermission}
              </span>
              {filters.permissionIds.length > 0 ? (
                <>
                  <Separator className="mx-1 h-4" orientation="vertical" />
                  <Badge
                    className="rounded-sm px-1 font-normal"
                    variant="secondary"
                  >
                    {filters.permissionIds.length}
                  </Badge>
                </>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-80 w-72 overflow-y-auto"
          >
            <DropdownMenuLabel>{t('ws-roles.permissions')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {filterOptions.permissions.map((permission) => (
              <DropdownMenuCheckboxItem
                key={permission.id}
                checked={filters.permissionIds.includes(permission.id)}
                onCheckedChange={(checked) =>
                  onFiltersChange({
                    ...filters,
                    permissionIds: toggleValue(
                      filters.permissionIds,
                      permission.id,
                      Boolean(checked)
                    ),
                  })
                }
              >
                {permission.title} ({permission.count})
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            className="size-8 shrink-0 px-0 text-muted-foreground hover:text-foreground"
            onClick={() => onFiltersChange({ permissionIds: [], roleIds: [] })}
            aria-label={labels.clearFiltersAction}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}

        {activeFilterCount > 0 ? (
          <Badge
            variant="outline"
            className="hidden rounded-full sm:inline-flex"
          >
            {activeFilterCount}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
