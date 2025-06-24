'use client';

import type { NovaExtendedChallenge } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Clock, Filter, Search } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import ChallengeCard from './challengeCard';

interface Props {
  isAdmin: boolean;
  wsId: string;
  challenges: NovaExtendedChallenge[];
}

export default function ChallengesList({ isAdmin, challenges, wsId }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<
    'disabled' | 'upcoming' | 'preview' | 'active' | 'closed' | 'all'
  >('all');

  const t = useTranslations('nova.challenges-page');

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
        return filter === 'active';
      }

      if (previewableAt && !openAt && !closeAt) {
        if (now < previewableAt) {
          return filter === 'upcoming';
        } else {
          return filter === 'preview';
        }
      }

      if (!previewableAt && openAt && !closeAt) {
        if (now < openAt) {
          return filter === 'preview';
        } else {
          return filter === 'active';
        }
      }

      if (!previewableAt && !openAt && closeAt) {
        if (now < closeAt) {
          return filter === 'upcoming';
        } else {
          return filter === 'closed';
        }
      }

      if (previewableAt && openAt && !closeAt) {
        if (now < previewableAt) {
          return filter === 'upcoming';
        } else if (now < openAt) {
          return filter === 'preview';
        } else {
          return filter === 'active';
        }
      }

      if (previewableAt && !openAt && closeAt) {
        if (now < previewableAt) {
          return filter === 'upcoming';
        } else if (now < closeAt) {
          return filter === 'preview';
        } else {
          return filter === 'closed';
        }
      }

      if (!previewableAt && openAt && closeAt) {
        if (now < openAt) {
          return filter === 'preview';
        } else if (now < closeAt) {
          return filter === 'active';
        } else {
          return filter === 'closed';
        }
      }

      if (previewableAt && openAt && closeAt) {
        if (now < previewableAt) {
          return filter === 'upcoming';
        } else if (now < openAt) {
          return filter === 'preview';
        } else if (now < closeAt) {
          return filter === 'active';
        } else {
          return filter === 'closed';
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
              placeholder={t('search-placeholder')}
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
                <TabsTrigger value="all">{t('filters.all')}</TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="disabled">
                    {t('filters.disabled')}
                  </TabsTrigger>
                )}
                {isAdmin && (
                  <TabsTrigger value="upcoming">
                    {t('filters.upcoming')}
                  </TabsTrigger>
                )}
                <TabsTrigger value="preview">
                  {t('filters.preview')}
                </TabsTrigger>
                <TabsTrigger value="active">{t('filters.active')}</TabsTrigger>
                <TabsTrigger value="closed">{t('filters.closed')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      {filteredChallenges.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredChallenges.map((challenge) => (
            <ChallengeCard
              wsId={wsId}
              isAdmin={isAdmin}
              key={challenge.id}
              challenge={challenge}
              canManage={challenge.canManage ?? false}
            />
          ))}
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <Clock className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-xl font-medium">
            {t('no-challenges-found.title')}
          </h3>
          <p className="mt-2 max-w-md text-muted-foreground">
            {searchQuery
              ? t('no-challenges-found.search-description')
              : t('no-challenges-found.default-description')}
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
              {t('clear-filters')}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
