'use client';

import { Calendar, Eye, EyeOff } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type {
  ChartInterval,
  DatePreset,
} from '../../../../hooks/use-analytics-filters';
import { Button } from '../../button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../select';
import { ToggleGroup, ToggleGroupItem } from '../../toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';

interface AnalyticsDateControlsProps {
  preset: DatePreset;
  interval: ChartInterval;
  includeConfidential: boolean;
  onPresetChange: (preset: DatePreset) => void;
  onIntervalChange: (interval: ChartInterval) => void;
  onConfidentialToggle: () => void;
  displayRange: string;
  className?: string;
}

export function AnalyticsDateControls({
  preset,
  interval,
  includeConfidential,
  onPresetChange,
  onIntervalChange,
  onConfidentialToggle,
  displayRange,
  className,
}: AnalyticsDateControlsProps) {
  const t = useTranslations('finance-analytics');

  // Define translation labels for each preset
  const presetLabels: Record<DatePreset, string> = {
    '7d': t('last-7-days'),
    '30d': t('last-30-days'),
    'this-month': t('this-month'),
    'last-month': t('last-month'),
    'this-quarter': t('this-quarter'),
    'this-year': t('this-year'),
    all: t('all-time'),
  };

  // Define translation labels for each interval
  const intervalLabels: Record<ChartInterval, string> = {
    daily: t('daily'),
    weekly: t('weekly'),
    monthly: t('monthly'),
    yearly: t('yearly'),
  };

  const presetValues: DatePreset[] = [
    '7d',
    '30d',
    'this-month',
    'last-month',
    'this-quarter',
    'this-year',
    'all',
  ];

  const intervalValues: ChartInterval[] = [
    'daily',
    'weekly',
    'monthly',
    'yearly',
  ];

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range preset selector */}
        <Select value={preset} onValueChange={onPresetChange}>
          <SelectTrigger className="w-[160px]">
            <Calendar className="mr-2 h-4 w-4" />
            <SelectValue placeholder={t('date-range')} />
          </SelectTrigger>
          <SelectContent>
            {presetValues.map((value) => (
              <SelectItem key={value} value={value}>
                {presetLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Interval selector */}
        <ToggleGroup
          type="single"
          value={interval}
          onValueChange={(value) => {
            if (value) onIntervalChange(value as ChartInterval);
          }}
          className="hidden sm:flex"
        >
          {intervalValues.map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={intervalLabels[value]}
              className="text-xs"
            >
              {intervalLabels[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Mobile interval selector */}
        <Select
          value={interval}
          onValueChange={(value) => onIntervalChange(value as ChartInterval)}
        >
          <SelectTrigger className="w-[120px] sm:hidden">
            <SelectValue placeholder={t('interval')} />
          </SelectTrigger>
          <SelectContent>
            {intervalValues.map((value) => (
              <SelectItem key={value} value={value}>
                {intervalLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        {/* Display range indicator */}
        <span className="hidden text-muted-foreground text-sm lg:inline">
          {displayRange}
        </span>

        {/* Confidential toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onConfidentialToggle}
              className="h-8 w-8"
            >
              {includeConfidential ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {includeConfidential
              ? t('hide-confidential')
              : t('show-confidential')}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
