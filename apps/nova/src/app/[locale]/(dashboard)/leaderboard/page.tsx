'use client';

import LeaderboardPage from './client';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('/api/v1/leaderboard', {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch leaderboard data');
        }

        const json = await response.json();
        setData(json.data || []);
        setChallenges(json.challenges || []);
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  if (loading) {
    return <div className="p-6 text-center">Loading leaderboard...</div>;
  }

  return <LeaderboardPage data={data} challenges={challenges} />;
}
