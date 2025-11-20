'use client';

import { Calendar } from '@tuturuuu/icons';
import { DateTimePicker } from '@tuturuuu/ui/date-time-picker';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { endOfDay, format, startOfDay } from 'date-fns';
import { useTranslations } from 'next-intl';

interface AnalyticsFilters {
  workspaceId?: string;
  channelId?: string;
  startDate: Date;
  endDate: Date;
  metric: 'requests' | 'users';
  viewMode: 'daily' | 'hourly';
}

interface RealtimeAnalyticsFiltersProps {
  filters: AnalyticsFilters;
  onFiltersChange: (filters: AnalyticsFilters) => void;
  workspaces?: Array<{ id: string; name: string }>;
  isLoadingWorkspaces?: boolean;
}

export function RealtimeAnalyticsFilters({
  filters,
  onFiltersChange,
  workspaces = [],
  isLoadingWorkspaces = false,
}: RealtimeAnalyticsFiltersProps) {
  const t = useTranslations('realtime-analytics');

  const handleWorkspaceChange = (value: string) => {
    onFiltersChange({
      ...filters,
      workspaceId: value === 'all' ? undefined : value,
      channelId: undefined, // Reset channel when workspace changes
    });
  };

  const handleChannelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({
      ...filters,
      channelId: e.target.value || undefined,
    });
  };

  const handleMetricChange = (value: string) => {
    onFiltersChange({
      ...filters,
      metric: value as 'requests' | 'users',
    });
  };

  const handleViewModeChange = (value: string) => {
    const newViewMode = value as 'daily' | 'hourly';
    const now = new Date();

    onFiltersChange({
      ...filters,
      viewMode: newViewMode,
      // For hourly view, set both dates to today (00:00 to 23:59)
      startDate: newViewMode === 'hourly' ? startOfDay(now) : filters.startDate,
      endDate: newViewMode === 'hourly' ? endOfDay(now) : filters.endDate,
    });
  };

  const handleDatePreset = (preset: string) => {
    const now = new Date();
    let startDate = new Date();

    switch (preset) {
      case 'last_24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'last_7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return;
    }

    onFiltersChange({
      ...filters,
      startDate,
      endDate: now,
    });
  };

  return (
    <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm">
      {/* Primary Controls Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* View Mode */}
        <div className="space-y-2">
          <Label className="font-semibold text-sm">View Mode</Label>
          <Tabs value={filters.viewMode} onValueChange={handleViewModeChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="hourly" className="gap-2">
                <Calendar className="h-4 w-4" />
                Hourly
              </TabsTrigger>
              <TabsTrigger value="daily" className="gap-2">
                <Calendar className="h-4 w-4" />
                Daily
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Metric Type */}
        <div className="space-y-2">
          <Label className="font-semibold text-sm">
            {t('filters.metric_toggle')}
          </Label>
          <Tabs value={filters.metric} onValueChange={handleMetricChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="requests">{t('metric.requests')}</TabsTrigger>
              <TabsTrigger value="users">{t('metric.users')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Separator />

      {/* Date Selection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="font-semibold text-sm">
            {filters.viewMode === 'hourly' ? 'Select Date' : 'Date Range'}
          </Label>
          {filters.viewMode === 'daily' && (
            <Select onValueChange={handleDatePreset} value="">
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="Quick select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_24h">Last 24 hours</SelectItem>
                <SelectItem value="last_7d">Last 7 days</SelectItem>
                <SelectItem value="last_30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {filters.viewMode === 'hourly' ? (
          /* Hourly View: Single Date Picker */
          <DateTimePicker
            date={filters.startDate}
            setDate={(date) => {
              if (date) {
                console.log(startOfDay(date));
                console.log(endOfDay(date));
                onFiltersChange({
                  ...filters,
                  startDate: startOfDay(date),
                  endDate: endOfDay(date),
                });
              }
            }}
            showTimeSelect={false}
            showFooterControls={true}
            allowClear={false}
          />
        ) : (
          /* Daily View: Date Range Picker */
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">
                Start Date
              </Label>
              <DateTimePicker
                date={filters.startDate}
                setDate={(date) => {
                  if (date) {
                    onFiltersChange({
                      ...filters,
                      startDate: startOfDay(date),
                    });
                  }
                }}
                maxDate={filters.endDate}
                showTimeSelect={false}
                showFooterControls={true}
                allowClear={false}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">End Date</Label>
              <DateTimePicker
                date={filters.endDate}
                setDate={(date) => {
                  if (date) {
                    onFiltersChange({ ...filters, endDate: endOfDay(date) });
                  }
                }}
                minDate={filters.startDate}
                showTimeSelect={false}
                showFooterControls={true}
                allowClear={false}
              />
            </div>
          </div>
        )}

        {/* Selected Range Display */}
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">
            {filters.viewMode === 'hourly'
              ? `${format(filters.startDate, 'PPP')} (0:00 - 23:00)`
              : `${format(filters.startDate, 'PPP')} - ${format(filters.endDate, 'PPP')}`}
          </span>
        </div>
      </div>

      <Separator />

      {/* Filters */}
      <div className="space-y-4">
        <Label className="font-semibold text-sm">Filters</Label>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Workspace Filter */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">
              {t('filters.workspace')}
            </Label>
            <Select
              value={filters.workspaceId || 'all'}
              onValueChange={handleWorkspaceChange}
              disabled={isLoadingWorkspaces}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('filters.workspace_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('filters.all_workspaces')}
                </SelectItem>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Channel Filter */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">
              {t('filters.channel')}
            </Label>
            <Input
              type="text"
              placeholder={t('filters.channel_placeholder')}
              value={filters.channelId || ''}
              onChange={handleChannelChange}
              disabled={!filters.workspaceId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
