import type { LeaderboardEntry } from '@/components/leaderboard/leaderboard';
import { useEffect, useState } from 'react';

export function useLeaderboard(initialData: LeaderboardEntry[]) {
  const [data, setData] = useState<LeaderboardEntry[]>(initialData);
  const [filteredData, setFilteredData] =
    useState<LeaderboardEntry[]>(initialData);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Filter by search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredData(data);
      return;
    }

    const filtered = data.filter((entry) =>
      entry.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredData(filtered);
  }, [searchQuery, data]);

  return {
    data,
    setData,
    filteredData,
    setFilteredData,
    searchQuery,
    setSearchQuery,
    isLoading,
    setIsLoading,
  };
}
