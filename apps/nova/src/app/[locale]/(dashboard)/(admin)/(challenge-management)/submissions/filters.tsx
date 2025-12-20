'use client';

import { LayoutGrid, LayoutList } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
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
import { useEffect, useRef, useState } from 'react';

interface ChallengeOption {
  id: string;
  title: string;
}

interface ProblemOption {
  id: string;
  title: string;
  challenge_id: string;
}

interface UserOption {
  id: string;
  display_name: string;
  email: string;
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
  selectedUser: string;
  handleUserChange?: (value: string) => void;
  handleClearFilters?: () => void;
  challenges: ChallengeOption[];
  filteredProblems: ProblemOption[];
  users: UserOption[];
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
  selectedUser,
  handleUserChange,
  handleClearFilters,
  challenges,
  filteredProblems,
  users,
  serverSide = false,
}: SubmissionFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('nova.submission-page.filters');
  const [userSearch, setUserSearch] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<UserOption[]>(users);

  // Filter users based on search input
  useEffect(() => {
    const searchLower = userSearch.toLowerCase().trim();
    if (searchLower === '') {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter((user) =>
        user.email.toLowerCase().includes(searchLower)
      );
      setFilteredUsers(filtered);
    }
  }, [userSearch, users]);

  // Fallback for translation
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userInputRef = useRef<HTMLInputElement>(null);

  const onUserChange = (value: string) => {
    if (serverSide) {
      const params = new URLSearchParams(window.location.search);
      if (searchQuery) params.set('search', searchQuery);
      if (selectedChallenge) params.set('challengeId', selectedChallenge);
      if (selectedProblem) params.set('problemId', selectedProblem);
      if (value !== 'all') params.set('userId', value);
      const queryString = params.toString();
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`);
    } else if (handleUserChange) {
      handleUserChange(value);
    }
  };

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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Select
          value={selectedChallenge || 'all'}
          onValueChange={onChallengeChange}
        >
          <SelectTrigger>
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
          <SelectTrigger>
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

        {/* Custom user filter dropdown */}
        <div className="relative">
          <Input
            placeholder="Search by email..."
            value={userSearch}
            onChange={(e) => {
              setUserSearch(e.target.value);
              setUserDropdownOpen(true);
              if (e.target.value === '') {
                onUserChange(''); // Clear user filter when search bar is empty
              }
            }}
            className="mb-2 h-8"
            autoComplete="off"
            onFocus={() => setUserDropdownOpen(true)}
            ref={userInputRef}
          />
          {userDropdownOpen && (
            <div
              className="absolute z-20 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border bg-background shadow-lg"
              tabIndex={-1}
              onBlur={() => setTimeout(() => setUserDropdownOpen(false), 150)}
            >
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={`cursor-pointer px-4 py-2 hover:bg-accent ${selectedUser === user.id ? 'font-semibold' : ''}`}
                  onMouseDown={() => {
                    onUserChange(user.id);
                    setUserDropdownOpen(false);
                    setUserSearch(user.email);
                    if (userInputRef.current) userInputRef.current.blur();
                  }}
                >
                  {user.email}
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <div className="px-4 py-2 text-muted-foreground">
                  No users found
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {(selectedChallenge ||
            selectedProblem ||
            selectedUser ||
            searchQuery) && (
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
  );
}
