'use client';

import {
  Calendar,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
} from '@tuturuuu/icons';
import type { TransactionViewMode } from '@tuturuuu/types/primitives/TransactionPeriod';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../select';
import { ToggleGroup, ToggleGroupItem } from '../../toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';

interface ViewModeToggleProps {
  value: TransactionViewMode;
  onChange: (value: TransactionViewMode) => void;
  className?: string;
}

const VIEW_MODE_OPTIONS: TransactionViewMode[] = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
];

const VIEW_MODE_ICONS: Record<
  TransactionViewMode,
  React.ComponentType<{ className?: string }>
> = {
  daily: Calendar,
  weekly: CalendarDays,
  monthly: CalendarRange,
  yearly: LayoutGrid,
};

export function ViewModeToggle({
  value,
  onChange,
  className,
}: ViewModeToggleProps) {
  const t = useTranslations('finance-transactions');

  const getLabel = (mode: TransactionViewMode): string => {
    switch (mode) {
      case 'daily':
        return t('view-daily');
      case 'weekly':
        return t('view-weekly');
      case 'monthly':
        return t('view-monthly');
      case 'yearly':
        return t('view-yearly');
      default:
        return mode;
    }
  };

  return (
    <div className={cn('flex items-center', className)}>
      {/* Desktop: ToggleGroup */}
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(newValue) => {
          if (newValue) onChange(newValue as TransactionViewMode);
        }}
        className="hidden sm:flex"
      >
        {VIEW_MODE_OPTIONS.map((mode) => {
          const Icon = VIEW_MODE_ICONS[mode]!;
          return (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={mode}
                  aria-label={getLabel(mode)}
                  className="h-8 gap-1.5 px-2.5 text-xs"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{getLabel(mode)}</span>
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent className="lg:hidden">
                {getLabel(mode)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>

      {/* Mobile: Select dropdown */}
      <Select
        value={value}
        onValueChange={(v) => onChange(v as TransactionViewMode)}
      >
        <SelectTrigger className="h-8 w-[120px] sm:hidden">
          <SelectValue placeholder={t('view-mode')} />
        </SelectTrigger>
        <SelectContent>
          {VIEW_MODE_OPTIONS.map((mode) => {
            const Icon = VIEW_MODE_ICONS[mode]!;
            return (
              <SelectItem key={mode} value={mode}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {getLabel(mode)}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
