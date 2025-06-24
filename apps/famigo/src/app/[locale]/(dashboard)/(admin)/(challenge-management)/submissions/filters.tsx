'use client';

import { Button } from '@tuturuuu/ui/button';
import { LayoutGrid, LayoutList } from '@tuturuuu/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface ChallengeOption {
  id: string;
  title: string;
}

interface ProblemOption {
  id: string;
  title: string;
  challenge_id: string;
}

interface SubmissionFiltersProps {
  searchQuery: string;
  setSearchQuery?: (query: string) => void;
  viewMode?: 'table' | 'grid';
  setViewMode?: (mode: 'table' | 'grid') => void;
  selectedChallenge: string;
  handleChallengeChange?: (value: string) => void;
  selectedProblem: string;
  handleProblemChange?: (value: string) => void;
  handleClearFilters?: () => void;
  challenges: ChallengeOption[];
  filteredProblems: ProblemOption[];
  serverSide?: boolean;
}

export function SubmissionFilters({
  searchQuery,
  viewMode = 'table',
  setViewMode,
  selectedChallenge,
  handleChallengeChange,
  selectedProblem,
  handleProblemChange,
  handleClearFilters,
  challenges,
  filteredProblems,
  serverSide = false,
}: SubmissionFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('nova.submission-page.filters');

  // Handle challenge change
  const onChallengeChange = (value: string) => {
    if (serverSide) {
      // Use URL-based navigation for server-side
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (value !== 'all') params.set('challengeId', value);
      // Reset problem selection when challenge changes

      const queryString = params.toString();
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`);
    } else if (handleChallengeChange) {
      // Use callback for client-side
      handleChallengeChange(value);
    }
  };

  // Handle problem change
  const onProblemChange = (value: string) => {
    if (serverSide) {
      // Use URL-based navigation for server-side
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (selectedChallenge) params.set('challengeId', selectedChallenge);
      if (value !== 'all') params.set('problemId', value);

      const queryString = params.toString();
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`);
    } else if (handleProblemChange) {
      // Use callback for client-side
      handleProblemChange(value);
    }
  };

  // Handle clearing filters
  const onClearFilters = () => {
    if (serverSide) {
      // Reset all filters by navigating to the base path
      router.push(pathname);
    } else if (handleClearFilters) {
      // Use callback for client-side
      handleClearFilters();
    }
  };

  return (
    <div className="mb-6 rounded-lg border p-4">
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2">
          <Select
            value={selectedChallenge || 'all'}
            onValueChange={onChallengeChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Challenge" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('title')}</SelectItem>
              {challenges.map((challenge) => (
                <SelectItem key={challenge.id} value={challenge.id}>
                  {challenge.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedProblem || 'all'}
            onValueChange={onProblemChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Problem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('all-problems')}</SelectItem>
              {filteredProblems.map((problem) => (
                <SelectItem key={problem.id} value={problem.id}>
                  {problem.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center space-x-2">
            {(selectedChallenge || selectedProblem || searchQuery) && (
              <Button
                variant="outline"
                onClick={onClearFilters}
                className="whitespace-nowrap"
              >
                {t('clear-filters')}
              </Button>
            )}

            {setViewMode && (
              <div className="flex overflow-hidden rounded-md border">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMode('table')}
                  className={cn(
                    'h-9 rounded-none px-3',
                    viewMode === 'table' && 'bg-accent text-accent-foreground'
                  )}
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'h-9 rounded-none px-3',
                    viewMode === 'grid' && 'bg-accent text-accent-foreground'
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
