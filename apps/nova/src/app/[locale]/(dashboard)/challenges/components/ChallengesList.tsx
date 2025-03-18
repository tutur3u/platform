'use client';

import ChallengeCard from '../challengeCard';
import type { NovaChallenge } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Clock, Filter, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ChallengesListProps {
  initialChallenges: NovaChallenge[];
  isAdmin: boolean;
}

export default function ChallengesList({
  initialChallenges,
  isAdmin,
}: ChallengesListProps) {
  const [challenges] = useState<NovaChallenge[]>(initialChallenges);
  const [filteredChallenges, setFilteredChallenges] =
    useState<NovaChallenge[]>(initialChallenges);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'upcoming' | 'preview' | 'active' | 'closed' | 'disabled'
  >('all');

  useEffect(() => {
    // Apply filtering and search
    let result = [...challenges];

    // Apply status filter
    if (filter !== 'all') {
      const now = new Date();

      result = result.filter((challenge) => {
        const previewableAt = challenge.previewable_at
          ? new Date(challenge.previewable_at)
          : null;
        const openAt = challenge.open_at ? new Date(challenge.open_at) : null;
        const closeAt = challenge.close_at
          ? new Date(challenge.close_at)
          : null;

        if (filter === 'disabled') return !challenge.enabled;
        if (filter === 'closed') return closeAt && now >= closeAt;
        if (filter === 'active')
          return openAt && now >= openAt && (!closeAt || now < closeAt);
        if (filter === 'preview') return previewableAt && now >= previewableAt;
        if (filter === 'upcoming') return previewableAt && now < previewableAt;
        if (filter === 'all') return true;
      });
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (challenge) =>
          challenge.title.toLowerCase().includes(query) ||
          challenge.description.toLowerCase().includes(query)
      );
    }

    setFilteredChallenges(result);
  }, [challenges, filter, searchQuery]);

  return (
    <>
      <div className="bg-card mb-6 rounded-lg border p-4 shadow-sm">
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute left-3 top-2.5 h-4 w-4" />
            <Input
              placeholder="Search challenges..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center">
            <Filter className="text-muted-foreground mr-2 h-4 w-4" />
            <Tabs
              defaultValue="all"
              value={filter}
              onValueChange={(v) => setFilter(v as any)}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                )}
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="disabled">Disabled</TabsTrigger>
                )}
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {filteredChallenges.length > 0 ? (
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
          <Clock className="text-muted-foreground/50 h-12 w-12" />
          <h3 className="mt-4 text-xl font-medium">No challenges found</h3>
          <p className="text-muted-foreground mt-2 max-w-md">
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
