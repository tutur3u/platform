'use client';

import {
  Briefcase,
  Clock,
  Filter,
  Search,
  Star,
  Sun,
  Tag,
  TrendingUp,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { SessionWithRelations } from '../../types';
import type { FilterState } from './session-types';
import { getCategoryColor } from './session-utils';

interface SessionFiltersProps {
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => void;
  onClearFilters: () => void;
  categories: TimeTrackingCategory[] | null;
  filteredSessions: SessionWithRelations[] | undefined;
  showAdvancedFilters: boolean;
  onToggleAdvancedFilters: () => void;
}

export function SessionFilters({
  filters,
  onFilterChange,
  onClearFilters,
  categories,
  filteredSessions,
  showAdvancedFilters,
  onToggleAdvancedFilters,
}: SessionFiltersProps) {
  const t = useTranslations('time-tracker.session_history');

  const hasActiveFilters =
    filters.categoryId !== 'all' ||
    filters.duration !== 'all' ||
    filters.productivity !== 'all' ||
    filters.timeOfDay !== 'all' ||
    filters.projectContext !== 'all' ||
    filters.sessionQuality !== 'all';

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 sm:flex-none">
        <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('search_placeholder')}
          value={filters.searchQuery}
          onChange={(e) => onFilterChange('searchQuery', e.target.value)}
          className="h-9 w-full pl-10 sm:w-48 md:h-10 md:w-64"
        />
        {filters.searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="-translate-y-1/2 absolute top-1/2 right-1 h-6 w-6 p-0 hover:bg-transparent"
            onClick={() => onFilterChange('searchQuery', '')}
          >
            ×
          </Button>
        )}
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="relative h-9 md:h-10">
            <Filter className="h-4 w-4 md:mr-2" />
            {hasActiveFilters && (
              <div className="-top-1 -right-1 absolute h-2 w-2 rounded-full bg-dynamic-orange ring-2 ring-background" />
            )}
            <span className="hidden md:inline">{t('filters')}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[calc(100vw-2rem)] sm:w-96"
          align="end"
          side="bottom"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{t('advanced_analytics_filters')}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleAdvancedFilters}
              >
                {showAdvancedFilters ? t('simple') : t('advanced')}
              </Button>
            </div>

            {/* Basic Filters */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="flex items-center gap-2 font-medium text-sm">
                  <Tag className="h-3 w-3" />
                  {t('category')}
                </Label>
                <Select
                  value={filters.categoryId}
                  onValueChange={(value) => onFilterChange('categoryId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('all_categories')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_categories')}</SelectItem>
                    {categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-3 w-3 rounded-full',
                              getCategoryColor(category.color || 'BLUE')
                            )}
                          />
                          {category.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="flex items-center gap-2 font-medium text-sm">
                  <Clock className="h-3 w-3" />
                  {t('duration_type')}
                </Label>
                <Select
                  value={filters.duration}
                  onValueChange={(value) => onFilterChange('duration', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('all_durations')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_durations')}</SelectItem>
                    <SelectItem value="short">{t('short_duration')}</SelectItem>
                    <SelectItem value="medium">
                      {t('medium_duration')}
                    </SelectItem>
                    <SelectItem value="long">{t('long_duration')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Advanced Filters */}
            {showAdvancedFilters && (
              <div className="space-y-3 border-t pt-3">
                <div>
                  <Label className="flex items-center gap-2 font-medium text-sm">
                    <TrendingUp className="h-3 w-3" />
                    {t('productivity_type')}
                  </Label>
                  <Select
                    value={filters.productivity}
                    onValueChange={(value) =>
                      onFilterChange('productivity', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('all_productivity_types')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('all_types')}</SelectItem>
                      <SelectItem value="deep-work">
                        {t('deep_work')}
                      </SelectItem>
                      <SelectItem value="focused">{t('focused')}</SelectItem>
                      <SelectItem value="standard">{t('standard')}</SelectItem>
                      <SelectItem value="scattered">
                        {t('scattered')}
                      </SelectItem>
                      <SelectItem value="interrupted">
                        {t('interrupted')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="flex items-center gap-2 font-medium text-sm">
                    <Sun className="h-3 w-3" />
                    {t('time_of_day')}
                  </Label>
                  <Select
                    value={filters.timeOfDay}
                    onValueChange={(value) =>
                      onFilterChange('timeOfDay', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('all_times')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('all_times')}</SelectItem>
                      <SelectItem value="morning">{t('morning')}</SelectItem>
                      <SelectItem value="afternoon">
                        {t('afternoon')}
                      </SelectItem>
                      <SelectItem value="evening">{t('evening')}</SelectItem>
                      <SelectItem value="night">{t('night')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="flex items-center gap-2 font-medium text-sm">
                    <Briefcase className="h-3 w-3" />
                    {t('project_context')}
                  </Label>
                  <Select
                    value={filters.projectContext}
                    onValueChange={(value) =>
                      onFilterChange('projectContext', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('all_contexts')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('all_contexts')}</SelectItem>
                      <SelectItem value="project-work">
                        {t('project_work')}
                      </SelectItem>
                      <SelectItem value="meetings">{t('meetings')}</SelectItem>
                      <SelectItem value="learning">{t('learning')}</SelectItem>
                      <SelectItem value="administrative">
                        {t('administrative')}
                      </SelectItem>
                      <SelectItem value="general">
                        {t('general_tasks')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="flex items-center gap-2 font-medium text-sm">
                    <Star className="h-3 w-3" />
                    {t('session_quality')}
                  </Label>
                  <Select
                    value={filters.sessionQuality}
                    onValueChange={(value) =>
                      onFilterChange('sessionQuality', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('all_qualities')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('all_qualities')}</SelectItem>
                      <SelectItem value="excellent">
                        {t('excellent')}
                      </SelectItem>
                      <SelectItem value="good">{t('good')}</SelectItem>
                      <SelectItem value="average">{t('average')}</SelectItem>
                      <SelectItem value="needs-improvement">
                        {t('needs_improvement')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={onClearFilters}
                className="w-full"
              >
                {t('clear_all_filters')}
              </Button>
            </div>

            {/* Quick Analytics Preview */}
            {(filteredSessions?.length || 0) > 0 && (
              <div className="rounded-lg border-t bg-muted/30 p-3">
                <div className="mb-2 font-medium text-muted-foreground text-xs">
                  {t('filter_analytics')}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-bold text-primary">
                      {filteredSessions?.length}
                    </div>
                    <div className="text-muted-foreground">{t('sessions')}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
