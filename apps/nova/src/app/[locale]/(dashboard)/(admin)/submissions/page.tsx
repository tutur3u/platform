'use client';

import { NovaChallenge, NovaProblem, NovaSubmission } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
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
import { useEffect, useState } from 'react';

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

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const PAGE_SIZE = 10;

  useEffect(() => {
    fetchSubmissions();
  }, [currentPage, sortField, sortDirection]);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchSubmissions() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/submissions?page=${currentPage}&pageSize=${PAGE_SIZE}&sortField=${sortField}&sortDirection=${sortDirection}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch submissions');
      }

      const data = await response.json();
      setSubmissions(data.submissions);
      setTotalPages(Math.ceil(data.count / PAGE_SIZE));
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const response = await fetch('/api/v1/admin/submissions/stats');

      if (!response.ok) {
        throw new Error('Failed to fetch submission statistics');
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching submission statistics:', error);
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

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Submissions</h1>
      </div>

      {/* Stats Section */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <h3 className="font-medium text-muted-foreground">
                Total Submissions
              </h3>
              {stats ? (
                <p className="text-3xl font-bold">{stats.totalCount}</p>
              ) : (
                <Skeleton className="mx-auto mt-2 h-8 w-16" />
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
              {stats ? (
                <p className="text-3xl font-bold">
                  {stats.averageScore.toFixed(1)}
                </p>
              ) : (
                <Skeleton className="mx-auto mt-2 h-8 w-16" />
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
              {stats ? (
                <p className="text-3xl font-bold">{stats.highestScore}</p>
              ) : (
                <Skeleton className="mx-auto mt-2 h-8 w-16" />
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
              {stats ? (
                <p className="text-lg font-medium">
                  {formatDate(stats.lastSubmissionDate)}
                </p>
              ) : (
                <Skeleton className="mx-auto mt-2 h-8 w-32" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

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
                  No submissions found.
                </TableCell>
              </TableRow>
            ) : (
              // Submissions data
              submissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-medium">{submission.id}</TableCell>
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
