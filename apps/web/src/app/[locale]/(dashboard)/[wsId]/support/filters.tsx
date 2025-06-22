'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Badge } from '@tuturuuu/ui/badge';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@tuturuuu/ui/popover';
import {
  Filter,
  X,
  Search,
  Calendar,
  Eye,
  CheckCircle,
  type LucideIcon,
} from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

interface AdminInquiryFiltersProps {
  wsId: string;
  searchParams: {
    q?: string;
    status?: 'all' | 'unread' | 'read' | 'resolved' | 'unresolved';
    dateRange?: string;
  };
}

export function AdminInquiryFilters({ wsId, searchParams }: AdminInquiryFiltersProps) {
  const [localSearch, setLocalSearch] = useState(searchParams.q || '');
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const currentSearchParams = useSearchParams();
  const t = useTranslations();

  // Sync local search with URL params
  useEffect(() => {
    setLocalSearch(searchParams.q || '');
  }, [searchParams.q]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(currentSearchParams.toString());
    
    if (value === 'all' || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    
    // Reset page when filtering
    params.delete('page');
    
    router.push(`/${wsId}/support/admin?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter('q', localSearch);
  };

  const clearFilters = () => {
    setLocalSearch('');
    router.push(`/${wsId}/support/admin`);
  };

  const getActiveFilters = () => {
    const active = [];
    if (searchParams.q) active.push({ key: 'search', value: searchParams.q });
    if (searchParams.status && searchParams.status !== 'all') {
      active.push({ key: 'status', value: searchParams.status });
    }
    if (searchParams.dateRange && searchParams.dateRange !== 'all') {
      active.push({ key: 'dateRange', value: searchParams.dateRange });
    }
    return active;
  };

  const activeFilters = getActiveFilters();

  const statusOptions: Array<{ value: string; label: string; icon?: LucideIcon }> = [
    { value: 'all', label: t('support.all_statuses') },
    { value: 'unread', label: t('support.unread'), icon: Eye },
    { value: 'read', label: t('support.read'), icon: Eye },
    { value: 'unresolved', label: t('support.unresolved'), icon: CheckCircle },
    { value: 'resolved', label: t('support.resolved'), icon: CheckCircle },
  ];

  const dateRangeOptions = [
    { value: 'all', label: t('support.all_time') },
    { value: 'today', label: t('support.today') },
    { value: 'week', label: t('support.this_week') },
    { value: 'month', label: t('support.this_month') },
    { value: 'quarter', label: t('support.this_quarter') },
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Search Form */}
      <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('support.search_placeholder')}
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      {/* Filter Controls */}
      <div className="flex items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilters.length > 0 && (
                <Badge variant="secondary" className="h-5 w-5 rounded-full p-0 text-xs">
                  {activeFilters.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('support.status')}</Label>
                <Select
                  value={searchParams.status || 'all'}
                  onValueChange={(value) => updateFilter('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => {
                      const IconComponent = option.icon;
                      return (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            {IconComponent && <IconComponent className="h-4 w-4" />}
                            {option.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('support.date_range')}</Label>
                <Select
                  value={searchParams.dateRange || 'all'}
                  onValueChange={(value) => updateFilter('dateRange', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dateRangeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {activeFilters.length > 0 && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="w-full"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {activeFilters.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span className="capitalize">
                {filter.key === 'dateRange' ? 'Date' : filter.key}:
              </span>
              <span className="font-normal">{filter.value}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0.5 hover:bg-transparent"
                onClick={() => updateFilter(filter.key, '')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
} 