'use client';

import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { CalendarDays, Clock, LucideHistory, Search } from 'lucide-react';

interface LeaderboardFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  timeRange: 'weekly' | 'monthly' | 'allTime';
  changeTimeRange: (range: 'weekly' | 'monthly' | 'allTime') => void;
  isLoading: boolean;
}

export function LeaderboardFilters({
  searchQuery,
  setSearchQuery,
  timeRange,
  changeTimeRange,
  isLoading,
}: LeaderboardFiltersProps) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <Tabs
          value={timeRange}
          onValueChange={(value) =>
            changeTimeRange(value as 'weekly' | 'monthly' | 'allTime')
          }
          className="w-full md:w-auto"
        >
          <TabsList className="grid w-full grid-cols-3 md:w-auto">
            <TabsTrigger value="weekly" disabled={isLoading}>
              <Clock className="mr-2 h-4 w-4" />
              Weekly
            </TabsTrigger>
            <TabsTrigger value="monthly" disabled={isLoading}>
              <CalendarDays className="mr-2 h-4 w-4" />
              Monthly
            </TabsTrigger>
            <TabsTrigger value="allTime" disabled={isLoading}>
              <LucideHistory className="mr-2 h-4 w-4" />
              All Time
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full md:w-72">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8"
          />
        </div>
      </div>
    </div>
  );
}
