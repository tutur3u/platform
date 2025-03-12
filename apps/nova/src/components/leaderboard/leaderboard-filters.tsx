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
        <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
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
