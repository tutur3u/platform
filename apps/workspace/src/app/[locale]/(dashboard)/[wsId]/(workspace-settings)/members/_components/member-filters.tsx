'use client';

import { Check, KeyRound, ListFilter, ShieldCheck, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type {
  MemberFilterPermissionOption,
  MemberFilterRoleOption,
} from './member-filter-utils';

type FilterOption = {
  count: number;
  description?: string;
  label: string;
  value: string;
};

type SetFilterValues = (values: string[]) => unknown;

interface MemberFiltersProps {
  roleOptions: MemberFilterRoleOption[];
  permissionOptions: MemberFilterPermissionOption[];
  selectedPermissionIds: string[];
  selectedRoleIds: string[];
  setSelectedPermissionIds: SetFilterValues;
  setSelectedRoleIds: SetFilterValues;
  shownCount: number;
  totalCount: number;
}

export function MemberFilters({
  roleOptions,
  permissionOptions,
  selectedPermissionIds,
  selectedRoleIds,
  setSelectedPermissionIds,
  setSelectedRoleIds,
  shownCount,
  totalCount,
}: MemberFiltersProps) {
  const t = useTranslations('ws-members');
  const activeFilterCount =
    selectedRoleIds.length + selectedPermissionIds.length;

  const clearFilters = () => {
    setSelectedRoleIds([]);
    setSelectedPermissionIds([]);
  };

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-border bg-foreground/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 text-foreground/60 text-sm">
          <ListFilter className="h-4 w-4" />
          <span className="font-medium">{t('filters')}</span>
        </div>

        <MemberMultiFilter
          emptyLabel={t('no_roles_found')}
          icon={<ShieldCheck className="mr-2 h-4 w-4 text-dynamic-purple" />}
          options={roleOptions.map((role) => ({
            count: role.count,
            label: role.name,
            value: role.id,
          }))}
          placeholder={t('search_roles')}
          selectedValues={selectedRoleIds}
          setSelectedValues={setSelectedRoleIds}
          title={t('filter_by_role')}
        />

        <MemberMultiFilter
          emptyLabel={t('no_permissions_found')}
          icon={<KeyRound className="mr-2 h-4 w-4 text-dynamic-blue" />}
          options={permissionOptions.map((permission) => ({
            count: permission.count,
            description: permission.groupTitle,
            label: permission.title,
            value: permission.id,
          }))}
          placeholder={t('search_permissions')}
          selectedValues={selectedPermissionIds}
          setSelectedValues={setSelectedPermissionIds}
          title={t('filter_by_permission')}
        />

        {activeFilterCount > 0 && (
          <Button
            className="h-8 gap-1.5 px-2 text-foreground/60 hover:text-foreground"
            onClick={clearFilters}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
            {t('clear_filters')}
          </Button>
        )}
      </div>

      <div className="text-foreground/50 text-sm">
        {t('filters_result_summary', { shown: shownCount, total: totalCount })}
      </div>
    </div>
  );
}

interface MemberMultiFilterProps {
  emptyLabel: string;
  icon: ReactNode;
  options: FilterOption[];
  placeholder: string;
  selectedValues: string[];
  setSelectedValues: SetFilterValues;
  title: string;
}

function MemberMultiFilter({
  emptyLabel,
  icon,
  options,
  placeholder,
  selectedValues,
  setSelectedValues,
  title,
}: MemberMultiFilterProps) {
  const t = useTranslations('ws-members');
  const selectedSet = new Set(selectedValues);
  const selectedOptions = options.filter((option) =>
    selectedSet.has(option.value)
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="h-8 border-dashed bg-background/60"
          disabled={options.length === 0}
          size="sm"
          type="button"
          variant="outline"
        >
          {icon}
          {title}
          {selectedSet.size > 0 && (
            <>
              <Separator className="mx-2 h-4" orientation="vertical" />
              <Badge
                className="rounded-sm px-1 font-normal lg:hidden"
                variant="secondary"
              >
                {selectedSet.size}
              </Badge>
              <div className="hidden max-w-64 gap-1 lg:flex">
                {selectedOptions.length > 2 ||
                selectedOptions.length !== selectedSet.size ? (
                  <Badge
                    className="rounded-sm px-1 font-normal"
                    variant="secondary"
                  >
                    {t('selected_count', { count: selectedSet.size })}
                  </Badge>
                ) : (
                  selectedOptions.map((option) => (
                    <Badge
                      className="max-w-32 truncate rounded-sm px-1 font-normal"
                      key={option.value}
                      variant="secondary"
                    >
                      {option.label}
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedSet.has(option.value);

                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      const nextValues = new Set(selectedValues);
                      if (isSelected) {
                        nextValues.delete(option.value);
                      } else {
                        nextValues.add(option.value);
                      }
                      setSelectedValues([...nextValues]);
                    }}
                  >
                    <div
                      className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{option.label}</div>
                      {option.description && (
                        <div className="truncate text-foreground/50 text-xs">
                          {option.description}
                        </div>
                      )}
                    </div>
                    <span className="ml-2 font-mono text-foreground/40 text-xs">
                      {option.count}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedSet.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    className="justify-center text-center"
                    onSelect={() => setSelectedValues([])}
                  >
                    {t('clear_filters')}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
