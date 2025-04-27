import ScoreBadge from '@/components/common/ScoreBadge';
import { NovaSubmissionData } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  User,
  XCircle,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useEffect } from 'react';

interface SubmissionCardProps {
  submission: Partial<NovaSubmissionData>;
  isCurrent: boolean;
  onRequestFetch?: (submissionId: string) => void;
  isLoading?: boolean;
  queuePosition?: number;
}

export function SubmissionCard({
  submission,
  isCurrent,
  onRequestFetch,
  isLoading = false,
  queuePosition,
}: SubmissionCardProps) {
  useEffect(() => {
    // Only request fetch if we don't already have the full data
    if (!submission.id || submission.criteria || !onRequestFetch) return;
    onRequestFetch(submission.id);
  }, [submission.id, submission.criteria, onRequestFetch]);

  const isDetailsFetched = !!submission.criteria || !!submission.test_cases;
  const showSkeleton = isLoading && !isDetailsFetched;

  return (
    <Card
      key={submission.id}
      className={`overflow-hidden transition-all duration-200 ${isCurrent ? '' : 'border-muted-foreground/20'} ${showSkeleton ? 'opacity-90' : ''}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {submission.created_at && (
              <span className="text-muted-foreground text-xs">
                <Clock className="mr-1 inline h-3 w-3" />
                {new Date(submission.created_at).toLocaleString()}
              </span>
            )}

            {!isCurrent && (
              <Badge variant="outline" className="text-xs">
                <User className="mr-1 h-3 w-3" />
                Past Session
              </Badge>
            )}

            {isLoading && (
              <Badge variant="secondary" className="animate-pulse text-xs">
                {queuePosition === 0 ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Loading details...
                  </>
                ) : (
                  <>
                    <Clock className="mr-1 h-3 w-3" />
                    Queued {queuePosition ? `(${queuePosition})` : ''}
                  </>
                )}
              </Badge>
            )}

            {!isLoading && !isDetailsFetched && submission.id && (
              <Badge
                variant="outline"
                className="hover:bg-secondary cursor-pointer text-xs"
                onClick={() => onRequestFetch?.(submission.id!)}
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Load details
              </Badge>
            )}
          </div>

          {submission.total_score != null ? (
            <ScoreBadge
              score={submission.total_score}
              maxScore={10}
              className="px-2 py-0"
            >
              {submission.total_score.toFixed(2)}/10
            </ScoreBadge>
          ) : (
            showSkeleton && <Skeleton className="h-6 w-16" />
          )}
        </div>
      </CardHeader>
      <CardContent
        className={`space-y-6 ${showSkeleton ? 'animate-pulse' : ''}`}
      >
        <div>
          <h3 className="text-foreground mb-1 text-sm font-medium">Prompt:</h3>
          <div className="bg-muted rounded-md p-2 text-sm">
            {submission.prompt}
          </div>
        </div>

        {/* Test Case Evaluation */}
        {submission.total_tests && submission.total_tests > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium">
                Test Case Evaluation:
              </h3>
              {submission.test_case_score != null ? (
                <ScoreBadge
                  score={submission.test_case_score}
                  maxScore={10}
                  className="px-2 py-0"
                >
                  {submission.test_case_score.toFixed(2)}/10
                </ScoreBadge>
              ) : (
                showSkeleton && <Skeleton className="h-5 w-14" />
              )}
            </div>
            <div className="space-y-2 rounded-md border p-4">
              <div>
                <span className="text-sm">
                  Passed {submission.passed_tests} of {submission.total_tests}{' '}
                  test cases
                </span>
              </div>
              {submission.passed_tests != null &&
                submission.total_tests != null && (
                  <Progress
                    value={
                      (submission.passed_tests / submission.total_tests) * 100
                    }
                    className="h-2 w-full"
                    indicatorClassName={
                      submission.test_case_score != null &&
                      submission.test_case_score >= 8
                        ? 'bg-emerald-500'
                        : submission.test_case_score != null &&
                            submission.test_case_score >= 5
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    }
                  />
                )}
            </div>
          </div>
        ) : (
          showSkeleton && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-14" />
              </div>
              <Skeleton className="h-24 w-full" />
            </div>
          )
        )}

        {/* Criteria Evaluation */}
        {submission.total_criteria && submission.total_criteria > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium">
                Criteria Evaluation
                {isCurrent ? '' : ': (Hover to see Feedback)'}
              </h3>
              {submission.criteria_score != null ? (
                <ScoreBadge
                  score={submission.criteria_score}
                  maxScore={10}
                  className="px-2 py-0"
                >
                  {submission.criteria_score.toFixed(2)}/10
                </ScoreBadge>
              ) : (
                showSkeleton && <Skeleton className="h-5 w-14" />
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {submission.criteria?.map((cs) => {
                if (!cs) return null;

                return (
                  <HoverCard key={cs.criteria_id}>
                    <HoverCardTrigger asChild>
                      <div
                        className={`flex cursor-pointer items-center justify-between rounded-md border p-2 ${
                          cs.score >= 8
                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                            : cs.score >= 5
                              ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                              : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {cs.score >= 8 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : cs.score >= 5 ? (
                            <Clock className="h-4 w-4 text-amber-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">{cs.name}</span>
                        </div>
                        <ScoreBadge score={cs.score} maxScore={10}>
                          {cs.score}/10
                        </ScoreBadge>
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80 p-4">
                      <div className="space-y-2">
                        <h4 className="font-medium">Feedback</h4>
                        <p className="text-muted-foreground text-sm">
                          {cs.feedback}
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          </div>
        ) : (
          showSkeleton && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-14" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
