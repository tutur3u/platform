'use client';

import { NovaChallenge, NovaProblem, NovaSubmission } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  LayoutGrid,
  LayoutList,
  Loader2,
  MoreHorizontal,
  Search,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@tuturuuu/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import debounce from 'lodash/debounce';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface SubmissionWithDetails extends NovaSubmission {
  nova_problems: NovaProblem & {
    nova_challenges: NovaChallenge;
  };
  users: {
    display_name: string;
    avatar_url: string;
  };
}

interface SubmissionStats {
  totalCount: number;
  averageScore: number;
  highestScore: number;
  lastSubmissionDate: string;
}

interface ChallengeOption {
  id: string;
  title: string;
}

interface ProblemOption {
  id: string;
  title: string;
  challenge_id: string;
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [challenges, setChallenges] = useState<ChallengeOption[]>([]);
  const [problems, setProblems] = useState<ProblemOption[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<string>('');
  const [selectedProblem, setSelectedProblem] = useState<string>('');
  const [filteredProblems, setFilteredProblems] = useState<ProblemOption[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const router = useRouter();

  const PAGE_SIZE = 10;

  // Create a debounced function for search
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setCurrentPage(1);
      fetchSubmissions(query);
      fetchStats(query);
    }, 500),
    []
  );

  useEffect(() => {
    if (searchQuery) {
      setIsSearching(true);
      debouncedSearch(searchQuery);
    } else if (searchQuery === '') {
      // When search is cleared, fetch without delay
      setCurrentPage(1);
      fetchSubmissions('');
      fetchStats('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    fetchSubmissions();
  }, [
    currentPage,
    sortField,
    sortDirection,
    selectedChallenge,
    selectedProblem,
  ]);

  useEffect(() => {
    fetchStats();
    fetchFilters();
  }, []);

  useEffect(() => {
    // Filter problems based on selected challenge
    if (selectedChallenge) {
      setFilteredProblems(
        problems.filter((problem) => problem.challenge_id === selectedChallenge)
      );
      // Clear problem selection if it's not part of the selected challenge
      if (selectedProblem) {
        const problemBelongsToChallenge = problems.some(
          (p) =>
            p.id === selectedProblem && p.challenge_id === selectedChallenge
        );
        if (!problemBelongsToChallenge) {
          setSelectedProblem('');
        }
      }
    } else {
      setFilteredProblems(problems);
    }
  }, [selectedChallenge, problems, selectedProblem]);

  useEffect(() => {
    fetchStats();
  }, [selectedChallenge, selectedProblem, searchQuery]);

  async function fetchSubmissions(searchOverride?: string) {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: PAGE_SIZE.toString(),
        sortField: sortField,
        sortDirection: sortDirection,
        search: searchOverride !== undefined ? searchOverride : searchQuery,
      });

      if (selectedChallenge) {
        queryParams.append('challengeId', selectedChallenge);
        console.log('Filtering by challenge ID:', selectedChallenge);
      }

      if (selectedProblem) {
        queryParams.append('problemId', selectedProblem);
        console.log('Filtering by problem ID:', selectedProblem);
      }

      const url = `/api/v1/admin/submissions?${queryParams.toString()}`;
      console.log('Fetching submissions with URL:', url);

      const response = await fetch(url);

      if (!response.ok) {
        console.error('Failed to fetch submissions:', await response.text());
        throw new Error('Failed to fetch submissions');
      }

      const data = await response.json();
      console.log('Received submissions data:', data);
      setSubmissions(data.submissions || []);
      setTotalPages(Math.ceil((data.count || 0) / PAGE_SIZE));
    } catch (error) {
      console.error('Error fetching submissions:', error);
      setSubmissions([]);
      setTotalPages(0);
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  }

  async function fetchStats(searchOverride?: string) {
    setStatsLoading(true);
    try {
      console.log('Fetching stats with filters:', {
        challenge: selectedChallenge,
        problem: selectedProblem,
        search: searchOverride !== undefined ? searchOverride : searchQuery,
      });

      // Build query parameters to match the current filter state
      const queryParams = new URLSearchParams();

      if (selectedChallenge) {
        queryParams.append('challengeId', selectedChallenge);
      }

      if (selectedProblem) {
        queryParams.append('problemId', selectedProblem);
      }

      if (searchOverride !== undefined) {
        if (searchOverride) queryParams.append('search', searchOverride);
      } else if (searchQuery) {
        queryParams.append('search', searchQuery);
      }

      // Only append the query string if we have parameters
      const queryString = queryParams.toString();
      const url = `/api/v1/admin/submissions/stats${queryString ? `?${queryString}` : ''}`;

      console.log('Fetching stats with URL:', url);
      const response = await fetch(url, {
        // Add cache: 'no-store' to prevent caching
        cache: 'no-store',
      });

      if (!response.ok) {
        console.error('Stats API error:', await response.text());
        throw new Error('Failed to fetch submission statistics');
      }

      const data = await response.json();
      console.log('Received stats data:', data);
      setStats(data);
    } catch (error) {
      console.error('Error fetching submission statistics:', error);
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchFilters() {
    try {
      console.log('Fetching filters...');

      // Fetch challenges
      const challengesRes = await fetch('/api/v1/challenges');
      if (challengesRes.ok) {
        const challengesData = await challengesRes.json();
        console.log('Raw challenges data:', challengesData);

        // Ensure we handle the data format correctly
        if (Array.isArray(challengesData)) {
          const formattedChallenges = challengesData.map((challenge) => ({
            id: challenge.id,
            title: challenge.title || `Challenge ${challenge.id}`,
          }));
          console.log('Formatted challenges:', formattedChallenges);
          setChallenges(formattedChallenges);
        } else {
          console.error('Challenges data is not an array:', challengesData);
          setChallenges([]);
        }
      } else {
        console.error(
          'Failed to fetch challenges:',
          await challengesRes.text()
        );
        setChallenges([]);
      }

      // Fetch problems with more detailed information
      const problemsRes = await fetch('/api/v1/problems?includeChallenge=true');
      if (problemsRes.ok) {
        const problemsData = await problemsRes.json();
        console.log('Raw problems data:', problemsData);

        // Ensure we handle the data format correctly
        if (Array.isArray(problemsData)) {
          const formattedProblems = problemsData.map((problem) => ({
            id: problem.id,
            title: problem.title || `Problem ${problem.id}`,
            challenge_id: problem.challenge_id,
          }));
          console.log('Formatted problems:', formattedProblems);
          setProblems(formattedProblems);
          setFilteredProblems(formattedProblems);
        } else {
          console.error('Problems data is not an array:', problemsData);
          setProblems([]);
          setFilteredProblems([]);
        }
      } else {
        console.error('Failed to fetch problems:', await problemsRes.text());
        setProblems([]);
        setFilteredProblems([]);
      }
    } catch (error) {
      console.error('Error fetching filters:', error);
      setChallenges([]);
      setProblems([]);
      setFilteredProblems([]);
    }
  }

  function handleSort(field: string) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getScoreColor(score: number) {
    if (score >= 8)
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (score >= 5)
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  }

  function handleChallengeChange(value: string) {
    setSelectedChallenge(value === 'all' ? '' : value);
    setCurrentPage(1); // Reset to first page when filter changes
  }

  function handleProblemChange(value: string) {
    setSelectedProblem(value === 'all' ? '' : value);
    setCurrentPage(1); // Reset to first page when filter changes
  }

  function handleClearFilters() {
    setSelectedChallenge('');
    setSelectedProblem('');
    setCurrentPage(1);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
    setIsSearching(true);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    debouncedSearch.cancel(); // Cancel any pending debounce
    setIsSearching(true);
    fetchSubmissions();
    fetchStats();
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Submissions</h1>

        <div className="flex items-center gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex rounded-md border p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'rounded-sm px-2',
                      viewMode === 'table' && 'bg-accent'
                    )}
                    onClick={() => setViewMode('table')}
                  >
                    <LayoutList className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'rounded-sm px-2',
                      viewMode === 'grid' && 'bg-accent'
                    )}
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle view mode</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <form
            onSubmit={handleSearchSubmit}
            className="flex w-full max-w-sm items-center space-x-2"
          >
            <div className="relative flex-1">
              <Input
                type="text"
                placeholder="Search submissions..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pr-8"
              />
              {isSearching && (
                <Loader2 className="absolute top-2 right-2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <Button type="submit" size="icon" disabled={isSearching}>
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {/* Stats Section */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="font-medium text-muted-foreground">
                Total Submissions
              </h3>
              {statsLoading ? (
                <Skeleton className="mx-auto mt-2 h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{stats?.totalCount || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="font-medium text-muted-foreground">
                Average Score
              </h3>
              {statsLoading ? (
                <Skeleton className="mx-auto mt-2 h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">
                  {stats?.averageScore?.toFixed(1) || '0.0'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="font-medium text-muted-foreground">
                Highest Score
              </h3>
              {statsLoading ? (
                <Skeleton className="mx-auto mt-2 h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold">{stats?.highestScore || 0}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="font-medium text-muted-foreground">
                Last Submission
              </h3>
              {statsLoading ? (
                <Skeleton className="mx-auto mt-2 h-8 w-32" />
              ) : (
                <p className="text-lg font-medium">
                  {stats?.lastSubmissionDate
                    ? formatDate(stats.lastSubmissionDate)
                    : '-'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="w-full max-w-xs">
          <label className="mb-2 block text-sm font-medium">
            Filter by Challenge
          </label>
          <Select
            value={selectedChallenge || 'all'}
            onValueChange={handleChallengeChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Challenges" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Challenges</SelectItem>
              {challenges.map((challenge) => (
                <SelectItem key={challenge.id} value={challenge.id}>
                  {challenge.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full max-w-xs">
          <label className="mb-2 block text-sm font-medium">
            Filter by Problem
          </label>
          <Select
            value={selectedProblem || 'all'}
            onValueChange={handleProblemChange}
            disabled={filteredProblems.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Problems" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Problems</SelectItem>
              {filteredProblems.map((problem) => (
                <SelectItem key={problem.id} value={problem.id}>
                  {problem.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(selectedChallenge || selectedProblem) && (
          <Button
            variant="outline"
            onClick={handleClearFilters}
            className="mb-[1px]"
          >
            Clear Filters
          </Button>
        )}
      </div>

      {viewMode === 'table' ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>
                  <div
                    className="flex cursor-pointer items-center"
                    onClick={() => handleSort('user_id')}
                  >
                    User
                    {sortField === 'user_id' &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ))}
                    {sortField !== 'user_id' && (
                      <ArrowDownUp className="ml-1 h-4 w-4 opacity-50" />
                    )}
                  </div>
                </TableHead>
                <TableHead>
                  <div
                    className="flex cursor-pointer items-center"
                    onClick={() => handleSort('problem_id')}
                  >
                    Problem
                    {sortField === 'problem_id' &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ))}
                    {sortField !== 'problem_id' && (
                      <ArrowDownUp className="ml-1 h-4 w-4 opacity-50" />
                    )}
                  </div>
                </TableHead>
                <TableHead>
                  <div
                    className="flex cursor-pointer items-center"
                    onClick={() => handleSort('score')}
                  >
                    Score
                    {sortField === 'score' &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ))}
                    {sortField !== 'score' && (
                      <ArrowDownUp className="ml-1 h-4 w-4 opacity-50" />
                    )}
                  </div>
                </TableHead>
                <TableHead>
                  <div
                    className="flex cursor-pointer items-center"
                    onClick={() => handleSort('created_at')}
                  >
                    Date
                    {sortField === 'created_at' &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ))}
                    {sortField !== 'created_at' && (
                      <ArrowDownUp className="ml-1 h-4 w-4 opacity-50" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Loading state
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Skeleton className="h-6 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-60" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              ) : submissions.length === 0 ? (
                // Empty state
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {searchQuery ? (
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <p className="text-muted-foreground">
                          No results found for "{searchQuery}"
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSearchQuery('')}
                        >
                          Clear Search
                        </Button>
                      </div>
                    ) : (
                      'No submissions found.'
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                // Submissions data
                submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">
                      {submission.id}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {submission.users?.avatar_url ? (
                          <img
                            src={submission.users.avatar_url}
                            alt="User"
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            {submission.users?.display_name?.charAt(0) || '?'}
                          </div>
                        )}
                        <span>
                          {submission.users?.display_name || 'Unknown User'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {submission.nova_problems?.title || 'Unknown Problem'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {submission.nova_problems?.nova_challenges?.title ||
                            'Unknown Challenge'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          'font-medium',
                          getScoreColor(submission.score)
                        )}
                      >
                        {submission.score}/10
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(submission.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              (window.location.href = `/submissions/${submission.id}`)
                            }
                          >
                            View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            // Grid loading state
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-48 w-full rounded-lg" />
            ))
          ) : submissions.length === 0 ? (
            // Grid empty state
            <div className="col-span-full flex h-48 flex-col items-center justify-center space-y-4 rounded-lg border">
              {searchQuery ? (
                <>
                  <p className="text-center text-lg text-muted-foreground">
                    No results found for "{searchQuery}"
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                  >
                    Clear Search
                  </Button>
                </>
              ) : (
                <p className="text-center text-lg text-muted-foreground">
                  No submissions found.
                </p>
              )}
            </div>
          ) : (
            // Grid view
            submissions.map((submission) => (
              <Card
                key={submission.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => router.push(`/submissions/${submission.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle>Submission #{submission.id}</CardTitle>
                    <Badge className={cn(getScoreColor(submission.score))}>
                      {submission.score}/10
                    </Badge>
                  </div>
                  <CardDescription>
                    {formatDate(submission.created_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      {submission.users?.avatar_url ? (
                        <img
                          src={submission.users.avatar_url}
                          alt="User"
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          {submission.users?.display_name?.charAt(0) || '?'}
                        </div>
                      )}
                      <span className="truncate font-medium">
                        {submission.users?.display_name || 'Unknown User'}
                      </span>
                    </div>

                    <div>
                      <p className="line-clamp-1 font-medium">
                        {submission.nova_problems?.title || 'Unknown Problem'}
                      </p>
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        {submission.nova_problems?.nova_challenges?.title ||
                          'Unknown Challenge'}
                      </p>
                    </div>

                    <div className="line-clamp-2 text-sm">
                      <span className="font-medium">Prompt: </span>
                      {submission.prompt}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                  }}
                  className={cn(
                    currentPage === 1 && 'pointer-events-none opacity-50'
                  )}
                />
              </PaginationItem>

              {[...Array(totalPages)].map((_, i) => (
                <PaginationItem key={i}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentPage(i + 1);
                    }}
                    isActive={currentPage === i + 1}
                  >
                    {i + 1}
                  </PaginationLink>
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (currentPage < totalPages)
                      setCurrentPage(currentPage + 1);
                  }}
                  className={cn(
                    currentPage === totalPages &&
                      'pointer-events-none opacity-50'
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
