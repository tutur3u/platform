'use client';

import type { NovaChallenge } from '@tuturuuu/types/db';
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
import { generateFunName } from '@tuturuuu/utils/name-helper';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

type SessionWithDetails = {
  id: string;
  user_id: string;
  challenge_id: string;
  status: string;
  start_time: string;
  end_time: string | null;
  created_at: string;
  challenge: NovaChallenge;
  user: {
    id: string;
    display_name: string;
    avatar_url: string;
    email?: string | null;
  };
};

interface SessionTableProps {
  sessions: SessionWithDetails[];
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
}

export function SessionTable({
  sessions,
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
}: SessionTableProps) {
  const locale = useLocale();
  const router = useRouter();

  const t = useTranslations('nova.submission-page.submission-table');

  // Render loading skeletons for the table
  const renderSkeletons = () => {
    return Array.from({ length: 5 }).map((_, index) => (
      <TableRow key={`skeleton-${index}`}>
        <TableCell>
          <Skeleton className="h-4 w-24" />
        </TableCell>
        <TableCell>
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        </TableCell>
        {showEmail && (
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
        )}
        <TableCell>
          <Skeleton className="h-4 w-32" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-24" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-32" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-32" />
        </TableCell>
        <TableCell>
          <div className="flex justify-end">
            <Skeleton className="h-8 w-8" />
          </div>
        </TableCell>
      </TableRow>
    ));
  };

  // Handle sort change for server-side sorting
  const handleSortChange = (field: string) => {
    if (!serverSide) return;

    const searchParams = new URLSearchParams(window.location.search);
    const newDirection =
      sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';

    searchParams.set('sortField', field);
    searchParams.set('sortDirection', newDirection);

    // Preserve other params
    if (searchQuery) searchParams.set('search', searchQuery);

    const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
    router.push(newUrl);
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    if (serverSide) {
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set('page', page.toString());
      const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
      router.push(newUrl);
    } else if (setCurrentPage) {
      setCurrentPage(page);
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Render session status badge
  const renderStatusBadge = (status: 'IN_PROGRESS' | 'ENDED') => {
    const formattedStatus = status.toLowerCase() as 'in_progress' | 'ended';
    let className = '';

    switch (formattedStatus) {
      case 'in_progress':
        className =
          'bg-dynamic-purple/10 border border-dynamic-purple/10 text-dynamic-purple';
        break;
      case 'ended':
        className =
          'bg-dynamic-green/10 border border-dynamic-green/10 text-dynamic-green';
        break;
      default:
        className = 'bg-gray-100 text-gray-800';
    }

    return (
      <span
        className={`w-full flex-none items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
      >
        {/* @ts-ignore */}
        {t(`status.${formattedStatus as const}`)}
      </span>
    );
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
                    {t('headers.user')}
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
                        ? handleSort('challenge_id')
                        : handleSortChange('challenge_id')
                    }
                  >
                    Challenge
                    {sortField === 'challenge_id' &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ))}
                    {sortField !== 'challenge_id' && (
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
                        ? handleSort('status')
                        : handleSortChange('status')
                    }
                  >
                    Status
                    {sortField === 'status' &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ))}
                    {sortField !== 'status' && (
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
                        ? handleSort('start_time')
                        : handleSortChange('start_time')
                    }
                  >
                    Start Time
                    {sortField === 'start_time' &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ))}
                    {sortField !== 'start_time' && (
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
                        ? handleSort('end_time')
                        : handleSortChange('end_time')
                    }
                  >
                    End Time
                    {sortField === 'end_time' &&
                      (sortDirection === 'asc' ? (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ))}
                    {sortField !== 'end_time' && (
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
                renderSkeletons()
              ) : sessions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={showEmail ? 8 : 7}
                    className="h-24 text-center"
                  >
                    <div className="flex flex-col items-center justify-center py-4">
                      <p className="mb-2 text-lg font-medium">
                        {searchQuery
                          ? `${t('empty-state.no-results')} "${searchQuery}"`
                          : t('empty-state.no-submissions')}
                      </p>
                      {searchQuery && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (serverSide) {
                              router.push(window.location.pathname);
                            } else if (setSearchQuery) {
                              setSearchQuery('');
                            }
                          }}
                        >
                          {t('empty-state.clear-search')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                // Data rows
                sessions.map((session) => (
                  <TableRow key={session.id} className="cursor-pointer">
                    <TableCell
                      onClick={() => router.push(`/sessions/${session.id}`)}
                    >
                      <span className="font-mono text-xs">
                        {typeof session.id === 'string'
                          ? session.id.substring(0, 8)
                          : session.id}
                        ...
                      </span>
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/sessions/${session.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        {session.user?.avatar_url ? (
                          <img
                            src={session.user.avatar_url}
                            alt={session.user.display_name || 'User'}
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            {(
                              session.user?.display_name ||
                              generateFunName({
                                id: session.user?.display_name,
                                locale,
                              })
                            )?.charAt(0) || '?'}
                          </div>
                        )}
                        <span className="line-clamp-1">
                          {session.user?.display_name ||
                            generateFunName({
                              id: session.user?.display_name,
                              locale,
                            }) ||
                            'Unknown'}
                        </span>
                      </div>
                    </TableCell>
                    {showEmail && (
                      <TableCell
                        onClick={() => router.push(`/sessions/${session.id}`)}
                      >
                        <span className="text-sm text-muted-foreground">
                          {session.user?.email || 'No email available'}
                        </span>
                      </TableCell>
                    )}
                    <TableCell
                      onClick={() => router.push(`/sessions/${session.id}`)}
                    >
                      <div>
                        <p className="font-medium">
                          {session.challenge?.title || 'Unknown Challenge'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/sessions/${session.id}`)}
                      className="w-32 flex-none"
                    >
                      {renderStatusBadge(
                        session.status as 'IN_PROGRESS' | 'ENDED'
                      )}
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/sessions/${session.id}`)}
                      className="text-foreground/80"
                    >
                      {formatDate(session.start_time)}
                    </TableCell>
                    <TableCell
                      onClick={() => router.push(`/sessions/${session.id}`)}
                      className="text-foreground/80"
                    >
                      {formatDate(session.end_time)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/sessions/${session.id}`)
                            }
                          >
                            {t('actions.view-details')}
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
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
                  className={cn(
                    currentPage === 1 ? 'pointer-events-none opacity-50' : '',
                    'cursor-pointer'
                  )}
                />
              </PaginationItem>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Logic to show correct page numbers
                let pageNum = i + 1;
                if (totalPages > 5) {
                  if (currentPage > 3) {
                    pageNum = currentPage - 3 + i;
                  }
                  if (currentPage > totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  }
                }

                return pageNum <= totalPages ? (
                  <PaginationItem key={i}>
                    <PaginationLink
                      isActive={pageNum === currentPage}
                      onClick={() => handlePageChange(pageNum)}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                ) : null;
              })}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    handlePageChange(Math.min(currentPage + 1, totalPages))
                  }
                  className={cn(
                    currentPage >= totalPages
                      ? 'pointer-events-none opacity-50'
                      : '',
                    'cursor-pointer'
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </>
  );
}
