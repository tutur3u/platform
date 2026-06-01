'use client';

import { Circle, Filter } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

interface ProjectFilterMenuProps {
  statusFilter: string[];
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  priorityFilter: string[];
  setPriorityFilter: Dispatch<SetStateAction<string[]>>;
  healthFilter: string[];
  setHealthFilter: Dispatch<SetStateAction<string[]>>;
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

const statuses = [
  'backlog',
  'planned',
  'in_progress',
  'in_review',
  'completed',
  'cancelled',
  'active',
  'on_hold',
];
const priorities = ['critical', 'high', 'normal', 'low'];
const healthStatuses = ['on_track', 'at_risk', 'off_track'];

export function ProjectFilterMenu({
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  healthFilter,
  setHealthFilter,
  hasActiveFilters,
  clearFilters,
}: ProjectFilterMenuProps) {
  const t = useTranslations('task-projects');
  const filterCount =
    statusFilter.length + priorityFilter.length + healthFilter.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'gap-2 rounded-md',
            hasActiveFilters && 'border-dynamic-blue/40 bg-dynamic-blue/10'
          )}
        >
          <Filter className="h-4 w-4" />
          {t('toolbar.filters')}
          {hasActiveFilters ? (
            <Badge variant="secondary" className="h-5 rounded-sm px-1.5">
              {filterCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <FilterGroup title={t('toolbar.filter_status')}>
          {statuses.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={statusFilter.includes(status)}
              onCheckedChange={(checked) =>
                setStatusFilter((prev) =>
                  checked
                    ? [...prev, status]
                    : prev.filter((item) => item !== status)
                )
              }
            >
              {t(`status.${status}` as any)}
            </DropdownMenuCheckboxItem>
          ))}
        </FilterGroup>
        <DropdownMenuSeparator />
        <FilterGroup title={t('toolbar.filter_priority')}>
          {priorities.map((priority) => (
            <DropdownMenuCheckboxItem
              key={priority}
              checked={priorityFilter.includes(priority)}
              onCheckedChange={(checked) =>
                setPriorityFilter((prev) =>
                  checked
                    ? [...prev, priority]
                    : prev.filter((item) => item !== priority)
                )
              }
            >
              {t(`badges.${priority}` as any)}
            </DropdownMenuCheckboxItem>
          ))}
        </FilterGroup>
        <DropdownMenuSeparator />
        <FilterGroup title={t('toolbar.filter_health')}>
          {healthStatuses.map((health) => (
            <DropdownMenuCheckboxItem
              key={health}
              checked={healthFilter.includes(health)}
              onCheckedChange={(checked) =>
                setHealthFilter((prev) =>
                  checked
                    ? [...prev, health]
                    : prev.filter((item) => item !== health)
                )
              }
            >
              <Circle
                className={cn(
                  'mr-1 h-3 w-3 fill-current',
                  health === 'on_track' && 'text-dynamic-green',
                  health === 'at_risk' && 'text-dynamic-yellow',
                  health === 'off_track' && 'text-dynamic-red'
                )}
              />
              {t(`badges.${health}` as any)}
            </DropdownMenuCheckboxItem>
          ))}
        </FilterGroup>
        {hasActiveFilters ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={clearFilters}
              >
                {t('toolbar.clear_all_filters')}
              </Button>
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="px-2 py-1.5">
      <p className="mb-2 font-medium text-sm">{title}</p>
      {children}
    </div>
  );
}
