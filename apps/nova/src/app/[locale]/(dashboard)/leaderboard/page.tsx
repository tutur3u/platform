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

const teamData: LeaderboardEntry[] = [
  {
    id: '1',
    name: 'Alpha Team',
    avatar: '', // Add a default or team avatar if needed
    member: [
      {
        id: 'user1',
        name: 'John Doe',
        avatar: 'https://avatars.githubusercontent.com/u/1234567',
        role: 'Team Lead',
      },
      {
        id: 'user2',
        name: 'Jane Smith',
        avatar: 'https://avatars.githubusercontent.com/u/2345678',
        role: 'Developer',
      },
    ],
    score: 850,
    rank: 1,
  },
  {
    id: '2',
    name: 'Beta Squad',
    avatar: '',
    member: [
      {
        id: 'user3',
        name: 'Mike Johnson',
        avatar: 'https://avatars.githubusercontent.com/u/3456789',
        role: 'Team Lead',
      },
      {
        id: 'user4',
        name: 'Sarah Wilson',
        avatar: 'https://avatars.githubusercontent.com/u/4567890',
        role: 'Developer',
      },
    ],
    score: 720,
    rank: 2,
  },
  {
    id: '3',
    name: 'Gamma Force',
    avatar: '',
    member: [
      {
        id: 'user5',
        name: 'Alex Brown',
        avatar: 'https://avatars.githubusercontent.com/u/5678901',
        role: 'Team Lead',
      },
      {
        id: 'user6',
        name: 'Emily Davis',
        avatar: 'https://avatars.githubusercontent.com/u/6789012',
        role: 'Developer',
      },
    ],
    score: 680,
    rank: 3,
  },
  {
    id: '4',
    name: 'Delta Dynamics',
    avatar: '',
    member: [
      {
        id: 'user7',
        name: 'Chris Taylor',
        avatar: 'https://avatars.githubusercontent.com/u/7890123',
        role: 'Team Lead',
      },
      {
        id: 'user8',
        name: 'Lisa Anderson',
        avatar: 'https://avatars.githubusercontent.com/u/8901234',
        role: 'Developer',
      },
    ],
    score: 590,
    rank: 4,
  },
  {
    id: '5',
    name: 'Epsilon Elite',
    avatar: '',
    member: [
      {
        id: 'user9',
        name: 'David Martin',
        avatar: 'https://avatars.githubusercontent.com/u/9012345',
        role: 'Team Lead',
      },
      {
        id: 'user10',
        name: 'Amy White',
        avatar: 'https://avatars.githubusercontent.com/u/0123456',
        role: 'Developer',
      },
    ],
    score: 520,
    rank: 5,
  },
];

export default function Page() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [challenges, setChallenges] = useState<{ id: string; title: string }[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [isChecked, setIsTeamMode] = useState(false);
  const handleTeamModeChange = (checked: boolean) => {
    setIsTeamMode(checked);
    console.log('Team mode toggled:', checked);
  };
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

  return (
    <LeaderboardPage
      onTeamModeChange={handleTeamModeChange}
      data={isChecked ? teamData : data}
      challenges={challenges}
    />
  );
}
