'use client';

import ChallengeCardSkeleton from './ChallengeCardSkeleton';
import ChallengeCard from './challengeCard';
import { useQuery } from '@tanstack/react-query';
import type { NovaChallenge, NovaChallengeCriteria } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Clock, Filter, Search } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useMemo, useState } from 'react';

type ExtendedNovaChallenge = NovaChallenge & {
  criteria: NovaChallengeCriteria[];
};

interface ChallengesListProps {
  isAdmin: boolean;
}

async function fetchChallenges(): Promise<ExtendedNovaChallenge[]> {
  try {
    const response = await fetch('/api/v1/challenges', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch challenges');
    }

    const challenges = await response.json();

    const criteria = await Promise.all(
      challenges.map(async (challenge: NovaChallenge) => {
        const response = await fetch(
          `/api/v1/criteria?challengeId=${challenge.id}`
        );
        const data = await response.json();
        return {
          challengeId: challenge.id,
          criteria: data,
        };
      })
    );

    return challenges.map((challenge: NovaChallenge) => ({
      ...challenge,
      criteria:
        criteria.find((c) => c.challengeId === challenge.id)?.criteria || [],
    }));
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return [];
  }
}

export default function ChallengesList({ isAdmin }: ChallengesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<
    'disabled' | 'upcoming' | 'preview' | 'active' | 'closed' | 'all'
  >('all');

  // Use TanStack Query to fetch and cache challenges
  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ['challenges'],
    queryFn: fetchChallenges,
    refetchOnWindowFocus: true,
    refetchInterval: 60000, // Refetch every minute
  });

  const filteredChallenges = useMemo(() => {
    // Apply filtering and search
    let result = [...challenges];

    result = result.filter((challenge) => {
      // Apply status filter
      if (filter === 'all') return true;
      if (filter === 'disabled') return !challenge.enabled;

      const now = new Date();
      const previewableAt = challenge.previewable_at
        ? new Date(challenge.previewable_at)
        : null;
      const openAt = challenge.open_at ? new Date(challenge.open_at) : null;
      const closeAt = challenge.close_at ? new Date(challenge.close_at) : null;

      if (!previewableAt && !openAt && !closeAt) {
        return filter == 'active';
      }

      if (previewableAt && !openAt && !closeAt) {
        if (now < previewableAt) {
          return filter == 'upcoming';
        } else {
          return filter == 'preview';
        }
      }

      if (!previewableAt && openAt && !closeAt) {
        if (now < openAt) {
          return filter == 'preview';
        } else {
          return filter == 'active';
        }
      }

      if (!previewableAt && !openAt && closeAt) {
        if (now < closeAt) {
          return filter == 'upcoming';
        } else {
          return filter == 'closed';
        }
      }

      if (previewableAt && openAt && !closeAt) {
        if (now < previewableAt) {
          return filter == 'upcoming';
        } else if (now < openAt) {
          return filter == 'preview';
        } else {
          return filter == 'active';
        }
      }

      if (previewableAt && !openAt && closeAt) {
        if (now < previewableAt) {
          return filter == 'upcoming';
        } else if (now < closeAt) {
          return filter == 'preview';
        } else {
          return filter == 'closed';
        }
      }

      if (!previewableAt && openAt && closeAt) {
        if (now < openAt) {
          return filter == 'preview';
        } else if (now < closeAt) {
          return filter == 'active';
        } else {
          return filter == 'closed';
        }
      }

      if (previewableAt && openAt && closeAt) {
        if (now < previewableAt) {
          return filter == 'upcoming';
        } else if (now < openAt) {
          return filter == 'preview';
        } else if (now < closeAt) {
          return filter == 'active';
        } else {
          return filter == 'closed';
        }
      }
    });

    // Apply search query
    const query = searchQuery.trim().toLowerCase();
    result = result.filter(
      (challenge) =>
        challenge.title.toLowerCase().includes(query) ||
        challenge.description.toLowerCase().includes(query)
    );

    return result;
  }, [challenges, filter, searchQuery]);

  return (
    <>
      <div className="mb-6 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:space-y-0 md:space-x-4">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search challenges..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center">
            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
            <Tabs
              defaultValue="all"
              value={filter}
              onValueChange={(v) => setFilter(v as any)}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="disabled">Disabled</TabsTrigger>
                )}
                {isAdmin && (
                  <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                )}
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {isLoading ? (
        <ChallengeCardSkeleton />
      ) : filteredChallenges.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredChallenges.map((challenge) => (
            <ChallengeCard
              isAdmin={isAdmin}
              key={challenge.id}
              challenge={challenge}
            />
          ))}
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <Clock className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-xl font-medium">No challenges found</h3>
          <p className="mt-2 max-w-md text-muted-foreground">
            {searchQuery
              ? 'No challenges match your search criteria. Try adjusting your filters or search terms.'
              : 'There are no challenges available at the moment. Check back later or contact an administrator.'}
          </p>
          {searchQuery && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearchQuery('');
                setFilter('all');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </>
  );
}
