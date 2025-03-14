'use client';

import { Input } from '@tuturuuu/ui/input';
import { Search } from 'lucide-react';

interface LeaderboardFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function LeaderboardFilters({
  searchQuery,
  setSearchQuery,
}: LeaderboardFiltersProps) {
  return (
    <div className="mb-6">
      <div className="relative w-full md:w-96">
        <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8"
        />
      </div>
    </div>
  );
}
