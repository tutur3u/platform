'use client';

import type {
  NovaChallenge,
  NovaProblem,
  NovaSubmission,
} from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
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
  MoreHorizontal,
} from '@tuturuuu/ui/icons';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@tuturuuu/ui/pagination';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ScoreBadge from '@/components/common/ScoreBadge';

type SubmissionWithDetails = NovaSubmission & {
  problem: NovaProblem & {
    challenge: NovaChallenge;
  };
  user: {
    display_name: string;
    avatar_url: string;
    email?: string | null;
  };
  total_score: number;
};

interface SubmissionTableProps {
  submissions: SubmissionWithDetails[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery?: (query: string) => void;
  viewMode: 'table' | 'grid';
  currentPage: number;
  setCurrentPage?: (page: number) => void;
  totalPages: number;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  handleSort?: (field: string) => void;
  serverSide?: boolean;
  showEmail?: boolean;
  wsId: string;
}

export function SubmissionTable({
  submissions,
  loading,
  searchQuery,
  setSearchQuery,
  viewMode,
  currentPage,
  setCurrentPage,
  totalPages,
  sortField,
  sortDirection,
  handleSort,
  serverSide = false,
  showEmail = false,
  wsId,
}: SubmissionTableProps) {
  const router = useRouter();
  const t = useTranslations('nova.submission-page.submission-table');

  // Format date function for display
  function formatDate(dateString: string) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Function to calculate which page numbers to show
  const getVisiblePageNumbers = () => {
    // Always show first and last pages
    // Show pages around current page
    const delta = 2; // Number of pages to show before and after current page
    const range: number[] = [];

    // Calculate start and end, ensuring they're within bounds
    let start = Math.max(1, currentPage - delta);
    let end = Math.min(totalPages, currentPage + delta);

    // Adjust if needed to ensure we show enough pages
    if (end - start < 2 * delta) {
      if (start === 1) {
        end = Math.min(start + 2 * delta, totalPages);
      } else if (end === totalPages) {
        start = Math.max(end - 2 * delta, 1);
      }
    }

    // Add range
    for (let i = start; i <= end; i++) {
      range.push(i);
    }

    // Add ellipses and endpoints
    const result: (number | string)[] = [];

    // Add first page if not in range
    if (start > 1) {
      result.push(1);
      if (start > 2) result.push('...');
    }

    // Add range
    result.push(...range);

    // Add last page if not in range
    if (end < totalPages) {
      if (end < totalPages - 1) result.push('...');
      result.push(totalPages);
    }

    return result;
  };

  // Handle page change either via client-side or server-side navigation
  const handlePageChange = (page: number) => {
    if (serverSide) {
      // Use server-side navigation with query params
      router.push(`/${wsId}/submissions?page=${page}`);
    } else if (setCurrentPage) {
      // Use client-side state update
      setCurrentPage(page);
    }
  };

  // Handle sorting either via client-side or server-side navigation
  const handleSortChange = (field: string) => {
    if (serverSide) {
      // Determine new sort direction
      const newDirection =
        sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
      // Use server-side navigation with query params
      router.push(
        `/${wsId}/submissions?sortField=${field}&sortDirection=${newDirection}`
      );
    } else if (handleSort) {
      // Use client-side handler
      handleSort(field);
    }
  };

  // Handle clearing search
  const handleClearSearch = () => {
    if (serverSide) {
      // Use server-side navigation without search param
      router.push(`/${wsId}/submissions`);
    } else if (setSearchQuery) {
      // Use client-side state update
      setSearchQuery('');
    }
  };

  return (
    <>
      {viewMode === 'table' && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>
                  <div
                    className={cn(
                      'flex items-center',
                      !serverSide && handleSort ? 'cursor-pointer' : ''
                    )}
                    onClick={() =>
                      !serverSide && handleSort
                        ? handleSort('user_id')
                        : handleSortChange('user_id')
                    }
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
                {showEmail && <TableHead>Email</TableHead>}
                <TableHead>
                  <div
                    className={cn(
                      'flex items-center',
                      !serverSide && handleSort ? 'cursor-pointer' : ''
                    )}
                    onClick={() =>
                      !serverSide && handleSort
                        ? handleSort('problem_id')
                        : handleSortChange('problem_id')
                    }
                  >
                    {t('headers.problem')}
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
                    className={cn(
                      'flex items-center',
                      !serverSide && handleSort ? 'cursor-pointer' : ''
                    )}
                    onClick={() =>
                      !serverSide && handleSort
                        ? handleSort('score')
                        : handleSortChange('score')
                    }
                  >
                    {t('headers.score')}
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
                    className={cn(
                      'flex items-center',
                      !serverSide && handleSort ? 'cursor-pointer' : ''
                    )}
                    onClick={() =>
                      !serverSide && handleSort
                        ? handleSort('created_at')
                        : handleSortChange('created_at')
                    }
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
                <TableHead className="text-right">
                  {t('headers.actions')}
                </TableHead>
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
                    {showEmail && (
                      <TableCell>
                        <Skeleton className="h-6 w-48" />
                      </TableCell>
                    )}
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
                  <TableCell
                    colSpan={showEmail ? 7 : 6}
                    className="h-24 text-center"
                  >
                    {searchQuery ? (
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <p className="text-muted-foreground">
                          {t('empty-state.no-results')} " {searchQuery}"
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearSearch}
                        >
                          {t('empty-state.clear-search')}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        {t('empty-state.no-submissions')}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                // Data rows
                submissions.map((submission) => (
                  <TableRow key={submission.id} className="cursor-pointer">
                    <TableCell
                      onClick={() =>
                        router.push(`/${wsId}/submissions/${submission.id}`)
                      }
                    >
                      <span className="font-mono text-xs">
                        {typeof submission.id === 'string'
                          ? submission.id.substring(0, 8)
                          : submission.id}
                        ...
                      </span>
                    </TableCell>
                    <TableCell
                      onClick={() =>
                        router.push(`/${wsId}/submissions/${submission.id}`)
                      }
                    >
                      <div className="flex items-center gap-2">
                        {submission.user?.avatar_url ? (
                          <img
                            src={submission.user.avatar_url}
                            alt={submission.user.display_name || 'User'}
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            {submission.user?.display_name?.charAt(0) || '?'}
                          </div>
                        )}
                        <span>
                          {submission.user?.display_name || 'Unknown'}
                        </span>
                      </div>
                    </TableCell>
                    {showEmail && (
                      <TableCell
                        onClick={() =>
                          router.push(`/${wsId}/submissions/${submission.id}`)
                        }
                      >
                        <span className="text-sm text-muted-foreground">
                          {submission.user?.email || 'No email available'}
                        </span>
                      </TableCell>
                    )}
                    <TableCell
                      onClick={() =>
                        router.push(`/${wsId}/submissions/${submission.id}`)
                      }
                    >
                      <div>
                        <p className="font-medium">
                          {submission.problem?.title || 'Unknown Problem'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {submission.problem?.challenge?.title ||
                            'Unknown Challenge'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell
                      onClick={() =>
                        router.push(`/${wsId}/submissions/${submission.id}`)
                      }
                    >
                      <ScoreBadge
                        score={submission.total_score}
                        maxScore={10}
                        className="text-xs"
                      >
                        {submission.total_score.toFixed(1)}/10
                      </ScoreBadge>
                    </TableCell>
                    <TableCell
                      onClick={() =>
                        router.push(`/${wsId}/submissions/${submission.id}`)
                      }
                    >
                      {formatDate(submission.created_at)}
                    </TableCell>
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
                              router.push(
                                `/${wsId}/submissions/${submission.id}`
                              )
                            }
                          >
                            {t('actions.view-details')}
                          </DropdownMenuItem>
                          {submission.problem?.challenge?.id && (
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(
                                  `/${wsId}/challenges/${submission.problem.challenge.id}/results`
                                )
                              }
                            >
                              {t('actions.challenge-results')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination>
            <PaginationContent>
              {currentPage > 1 && (
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="cursor-pointer"
                  />
                </PaginationItem>
              )}

              {getVisiblePageNumbers().map((item, i) => (
                <PaginationItem key={i}>
                  {item === '...' ? (
                    <span className="flex h-9 w-9 items-center justify-center">
                      ...
                    </span>
                  ) : (
                    <PaginationLink
                      className="cursor-pointer"
                      isActive={currentPage === item}
                      onClick={() =>
                        typeof item === 'number' && handlePageChange(item)
                      }
                    >
                      {item}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}

              {currentPage < totalPages && (
                <PaginationItem>
                  <PaginationNext
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="cursor-pointer"
                  />
                </PaginationItem>
              )}
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </>
  );
}
