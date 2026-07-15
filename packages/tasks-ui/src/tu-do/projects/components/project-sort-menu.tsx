'use client';

import { Calendar, ChevronDown } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { SortBy, SortOrder } from '../types';

interface ProjectSortMenuProps {
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
}

const sortOptions: Array<{ value: SortBy; labelKey: string; icon?: boolean }> =
  [
    { value: 'created_at', labelKey: 'sort_created_date', icon: true },
    { value: 'name', labelKey: 'sort_name' },
    { value: 'status', labelKey: 'sort_status' },
    { value: 'priority', labelKey: 'sort_priority' },
    { value: 'health_status', labelKey: 'sort_health_status' },
    { value: 'tasks_count', labelKey: 'sort_task_count' },
  ];

export function ProjectSortMenu({
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
}: ProjectSortMenuProps) {
  const t = useTranslations('task-projects.toolbar');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-md">
          <ChevronDown className="h-4 w-4" />
          {t('sort')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={sortBy}
          onValueChange={(value) => setSortBy(value as SortBy)}
        >
          {sortOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.icon ? <Calendar className="mr-2 h-4 w-4" /> : null}
              {t(option.labelKey as any)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        >
          {sortOrder === 'asc' ? t('sort_ascending') : t('sort_descending')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
