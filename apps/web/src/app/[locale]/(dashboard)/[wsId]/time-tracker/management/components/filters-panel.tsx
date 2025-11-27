'use client';

import { Calendar, Filter, Search, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

interface FiltersPanelProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClearDateFilters: () => void;
  period: 'day' | 'week' | 'month';
  onPeriodChange: (period: 'day' | 'week' | 'month') => void;
  isLoading?: boolean;
  onDateRangeChange: (startDate: string, endDate: string) => void;
}

export default function FiltersPanel({
  searchQuery,
  onSearchChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClearDateFilters,
  period,
  onPeriodChange,
  isLoading = false,
  onDateRangeChange,
}: FiltersPanelProps) {
  const t = useTranslations('time-tracker.management.filters');

  const hasActiveFilters = searchQuery || startDate || endDate;

  const clearAllFilters = () => {
    onSearchChange('');
    onClearDateFilters();
  };

  return (
    <Card className="overflow-hidden border-dynamic-purple/20 transition-all duration-300">
      <CardHeader className="border-dynamic-purple/20 border-b bg-linear-to-r from-dynamic-purple/5 to-dynamic-blue/5 p-6">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-dynamic-foreground">
            <div className="rounded-lg bg-dynamic-purple/10 p-2 text-dynamic-purple">
              <Filter className="size-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                {t('title')}
                {hasActiveFilters && (
                  <Badge
                    variant="outline"
                    className="border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple"
                  >
                    {t('active')}
                  </Badge>
                )}
              </div>
              <p className="font-normal text-dynamic-muted text-sm">
                {t('description')}
              </p>
            </div>
          </CardTitle>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              disabled={isLoading}
              className="text-dynamic-muted transition-all hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
            >
              <X className="mr-1 size-4" />
              {t('clearAll')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-8 p-6">
        {/* Search and View Controls */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 transform text-dynamic-muted" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`border-dynamic-border/20 bg-dynamic-muted/5 pl-10 transition-all duration-200 focus:border-dynamic-purple/40 focus:bg-dynamic-purple/5 ${
                searchQuery
                  ? 'border-dynamic-purple/40 bg-dynamic-purple/5 ring-1 ring-dynamic-purple/20'
                  : ''
              }`}
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="whitespace-nowrap font-medium text-dynamic-muted text-sm">
              {t('viewBy')}
            </label>
            <Select
              value={period}
              onValueChange={onPeriodChange}
              disabled={isLoading}
            >
              <SelectTrigger className="w-40 border-dynamic-border/20 transition-colors hover:border-dynamic-purple/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t('dailyView')}</SelectItem>
                <SelectItem value="week">{t('weeklyView')}</SelectItem>
                <SelectItem value="month">{t('monthlyView')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-dynamic-muted" />
              <span className="font-medium text-dynamic-muted text-sm">
                {t('dateRange')}
              </span>
              {(startDate || endDate) && (
                <Badge
                  variant="outline"
                  className="border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple text-xs"
                >
                  <Calendar className="mr-1 size-3" />
                  {t('active')}
                </Badge>
              )}
            </div>
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearDateFilters}
                disabled={isLoading}
                className="text-dynamic-muted transition-all hover:bg-dynamic-purple/10 hover:text-dynamic-purple"
              >
                <X className="mr-1 size-3" />
                {t('clear')}
              </Button>
            )}
          </div>

          <div className="rounded-lg border border-dynamic-border/20 bg-dynamic-muted/5 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <label
                  htmlFor="start-date"
                  className="whitespace-nowrap font-medium text-dynamic-muted text-sm"
                >
                  {t('from')}
                </label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  className={`w-40 border-dynamic-border/20 bg-dynamic-background transition-all duration-200 focus:border-dynamic-purple/40 ${
                    startDate
                      ? 'border-dynamic-purple/40 bg-dynamic-purple/5 ring-1 ring-dynamic-purple/20'
                      : ''
                  }`}
                  disabled={isLoading}
                />
              </div>

              <div className="flex items-center gap-3">
                <label
                  htmlFor="end-date"
                  className="whitespace-nowrap font-medium text-dynamic-muted text-sm"
                >
                  {t('to')}
                </label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  className={`w-40 border-dynamic-border/20 bg-dynamic-background transition-all duration-200 focus:border-dynamic-purple/40 ${
                    endDate
                      ? 'border-dynamic-purple/40 bg-dynamic-purple/5 ring-1 ring-dynamic-purple/20'
                      : ''
                  }`}
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="space-y-3">
            <span className="font-medium text-dynamic-muted text-sm">
              {t('quickPresets')}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const today = dayjs().format('YYYY-MM-DD');
                  onDateRangeChange(today, today);
                }}
                disabled={isLoading}
                className="h-9 border-dynamic-border/20 text-xs transition-all duration-200 hover:border-dynamic-purple/30 hover:bg-dynamic-purple/10"
              >
                {t('today')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const startOfWeek = dayjs()
                    .startOf('week')
                    .add(1, 'day')
                    .format('YYYY-MM-DD');
                  const endOfWeek = dayjs()
                    .endOf('week')
                    .add(1, 'day')
                    .format('YYYY-MM-DD');
                  onDateRangeChange(startOfWeek, endOfWeek);
                }}
                disabled={isLoading}
                className="h-9 border-dynamic-border/20 text-xs transition-all duration-200 hover:border-dynamic-purple/30 hover:bg-dynamic-purple/10"
              >
                {t('thisWeek')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const startOfMonth = dayjs()
                    .startOf('month')
                    .format('YYYY-MM-DD');
                  const endOfMonth = dayjs()
                    .endOf('month')
                    .format('YYYY-MM-DD');
                  onDateRangeChange(startOfMonth, endOfMonth);
                }}
                disabled={isLoading}
                className="h-9 border-dynamic-border/20 text-xs transition-all duration-200 hover:border-dynamic-purple/30 hover:bg-dynamic-purple/10"
              >
                {t('thisMonth')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const last7Days = dayjs()
                    .subtract(7, 'days')
                    .format('YYYY-MM-DD');
                  const today = dayjs().format('YYYY-MM-DD');
                  onDateRangeChange(last7Days, today);
                }}
                disabled={isLoading}
                className="h-9 border-dynamic-border/20 text-xs transition-all duration-200 hover:border-dynamic-purple/30 hover:bg-dynamic-purple/10"
              >
                {t('last7Days')}
              </Button>
            </div>
          </div>

          {/* Active Date Range Display */}
          {(startDate || endDate) && (
            <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/10 p-3">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-dynamic-blue" />
                <span className="text-dynamic-blue text-sm">
                  {startDate && endDate
                    ? t('dateRangeDisplay.both', {
                        startDate: dayjs(startDate).format('MMM D, YYYY'),
                        endDate: dayjs(endDate).format('MMM D, YYYY'),
                      })
                    : startDate
                      ? t('dateRangeDisplay.from', {
                          startDate: dayjs(startDate).format('MMM D, YYYY'),
                        })
                      : t('dateRangeDisplay.until', {
                          endDate: dayjs(endDate).format('MMM D, YYYY'),
                        })}
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
