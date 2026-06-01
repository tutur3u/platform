'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
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

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={status}
          onValueChange={(value) =>
            onStatusChange(value as WorkspaceAccessMemberStatus)
          }
        >
          <TabsList className="h-auto">
            <TabsTrigger value="all">{t('ws-members.all')}</TabsTrigger>
            <TabsTrigger value="joined">{t('ws-members.joined')}</TabsTrigger>
            <TabsTrigger value="invited">{t('ws-members.invited')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {labels.filterByRole}
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
              <Button variant="outline" size="sm">
                {labels.filterByPermission}
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
              onClick={() =>
                onFiltersChange({ permissionIds: [], roleIds: [] })
              }
            >
              {labels.clearFiltersAction}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
