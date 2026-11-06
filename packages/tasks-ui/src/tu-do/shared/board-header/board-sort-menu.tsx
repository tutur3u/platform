import { ArrowUpDown, ChevronDown, Flag } from '@tuturuuu/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { TaskFilters } from '../task-filter.types';
import { type BoardSortOption, isBoardSortOption } from './board-filter-state';
import { ToneButton } from './tone-button';
import { ToolbarMenuItem } from './toolbar-menu-item';

/** Priority-only sort: Clear, High to Low, Low to High. */
export function BoardSortMenu({
  sortBy,
  onChange,
}: {
  sortBy: TaskFilters['sortBy'];
  onChange: (sortBy: BoardSortOption | undefined) => void;
}) {
  const t = useTranslations();
  const current = isBoardSortOption(sortBy) ? sortBy : undefined;
  const labels: Record<BoardSortOption, string> = {
    'priority-high': t('ws-task-boards.filters.sort_options.high_to_low'),
    'priority-low': t('ws-task-boards.filters.sort_options.low_to_high'),
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToneButton
          active={Boolean(current)}
          aria-label={t('common.sort')}
          tone="neutral"
        >
          <ArrowUpDown />
          <span className="@xl/board-header:inline hidden">
            {current ? labels[current] : t('common.sort')}
          </span>
          <ChevronDown className="@sm/board-header:block hidden opacity-60" />
        </ToneButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <ToolbarMenuItem
          checked={!current}
          description={t('ws-task-boards.filters.sort_options.clear_sorting')}
          icon={<ArrowUpDown />}
          label={t('common.sort')}
          onSelect={() => onChange(undefined)}
        />
        {(['priority-high', 'priority-low'] as const).map((option) => (
          <ToolbarMenuItem
            key={option}
            checked={current === option}
            description={t('ws-task-boards.filters.sort_options.priority')}
            icon={<Flag />}
            label={labels[option]}
            onSelect={() => onChange(option)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
