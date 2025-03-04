import type { LeaderboardEntry } from '@/components/leaderboard/leaderboard';
import { useEffect, useState } from 'react';

type TimeRange = 'weekly' | 'monthly' | 'allTime';

export function useLeaderboard(initialData: LeaderboardEntry[]) {
  const [data, setData] = useState<LeaderboardEntry[]>(initialData);
  const [filteredData, setFilteredData] =
    useState<LeaderboardEntry[]>(initialData);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeRange, setTimeRange] = useState<TimeRange>('weekly');
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

  // Simulate loading data for different time ranges
  const changeTimeRange = async (range: TimeRange) => {
    setIsLoading(true);
    setTimeRange(range);

    // Simulate API call with timeout
    setTimeout(() => {
      // Adjust scores based on timerange - in a real app, this would be a real API call
      const multiplier = range === 'weekly' ? 1 : range === 'monthly' ? 4 : 10;
      const adjustedData = initialData
        .map((entry) => ({
          ...entry,
          score: Math.round(entry.score * multiplier),
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));

      setData(adjustedData);
      setFilteredData(
        searchQuery
          ? adjustedData.filter((entry) =>
              entry.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
          : adjustedData
      );
      setIsLoading(false);
    }, 600);
  };

  return {
    data: filteredData,
    searchQuery,
    setSearchQuery,
    timeRange,
    changeTimeRange,
    isLoading,
  };
}
