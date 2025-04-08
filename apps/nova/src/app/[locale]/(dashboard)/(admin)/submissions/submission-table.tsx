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

interface SubmissionWithDetails extends NovaSubmission {
  nova_problems: NovaProblem & {
    nova_challenges: NovaChallenge;
  };
  users: {
    display_name: string;
    avatar_url: string;
  };
}

interface SubmissionTableProps {
  submissions: SubmissionWithDetails[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewMode: 'table' | 'grid';
  currentPage: number;
  setCurrentPage: (page: number) => void;
  totalPages: number;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  handleSort: (field: string) => void;
  formatDate: (dateString: string) => string;
  getScoreColor: (score: number) => string;
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
  formatDate,
  getScoreColor,
}: SubmissionTableProps) {
  const router = useRouter();

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
      )}

      {viewMode === 'grid' && (
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
    </>
  );
}
