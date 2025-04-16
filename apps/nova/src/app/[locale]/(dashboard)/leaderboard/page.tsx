'use client';

import LeaderboardPage from './client';
import { useEffect, useState } from 'react';

interface UserInterface {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

interface UserInterface {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  member?: UserInterface[];
  score: number;
  challenge_scores?: Record<string, number>;
};

export default function Page() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [challenges, setChallenges] = useState<{ id: string; title: string }[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [isChecked, setIsTeamMode] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const handleTeamModeChange = (checked: boolean) => {
    setIsTeamMode(checked);
    console.log('Team mode toggled:', checked);
  };

  const fetchLeaderboard = async (pageNumber: number) => {
    const baseUrl = isChecked
      ? `/api/v1/leaderboard/team?page=${pageNumber}`
      : `/api/v1/leaderboard?page=${pageNumber}`;
    try {
      const response = await fetch(baseUrl, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard data');
      }

      const json = await response.json();

      if (pageNumber === 1) {
        setData(json.data || []);
      } else {
        setData((prev) => [...prev, ...(json.data || [])]);
      }

      setChallenges(json.challenges || []);
      setHasMore(json.hasMore || false);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchLeaderboard(1);
  }, [isChecked]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLeaderboard(nextPage);
  };

  if (loading) {
    return <div className="p-6 text-center">Loading leaderboard...</div>;
  }

  return (
    <LeaderboardPage
      onTeamModeChange={handleTeamModeChange}
      data={data}
      isChecked={isChecked}
      challenges={challenges}
      onLoadMore={handleLoadMore}
      hasMore={hasMore}
    />
  );
}
