import type { NovaSubmissionData } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  Clock,
  Code,
  Compass,
  FileCode,
  Loader2,
  RefreshCw,
  User,
} from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useEffect, useState } from 'react';
import CriteriaEvaluation from '@/components/common/CriteriaEvaluation';
import ScoreBadge from '@/components/common/ScoreBadge';
import TestCaseEvaluation from '@/components/common/TestCaseEvaluation';

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
  const [activeTab, setActiveTab] = useState<string>('test-cases');

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
      className={`overflow-hidden transition-all duration-200 ${showSkeleton ? 'opacity-90' : ''}`}
    >
      <CardHeader className="pt-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {submission.created_at && (
              <Badge variant="outline" className="text-xs">
                <Clock className="mr-1 inline h-3 w-3" />
                {new Date(submission.created_at).toLocaleString()}
              </Badge>
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
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => submission.id && onRequestFetch?.(submission.id)}
              >
                <RefreshCw className="h-3 w-3" />
                Load details
              </Button>
            )}
          </div>

          {submission.total_score != null ? (
            <ScoreBadge
              score={submission.total_score}
              maxScore={10}
              className="h-8 px-3 py-1 text-sm font-bold"
            >
              {submission.total_score.toFixed(2)}/10
            </ScoreBadge>
          ) : (
            showSkeleton && <Skeleton className="h-8 w-20" />
          )}
        </div>
      </CardHeader>

      <CardContent
        className={`space-y-6 ${showSkeleton ? 'animate-pulse' : ''}`}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-primary/70" />
            <h3 className="text-sm font-medium text-foreground">Prompt</h3>
          </div>
          <div className="rounded-md border bg-muted/50 p-3 text-sm whitespace-pre-line">
            {submission.prompt ||
              (showSkeleton && <Skeleton className="h-16 w-full" />)}
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList className="w-full">
            <TabsTrigger value="test-cases" className="flex-1">
              <div className="flex items-center gap-1">
                <Code className="h-4 w-4" />
                <span>Test Cases</span>
              </div>
              {submission.test_case_score != null && (
                <span className="ml-2 inline-block">
                  <ScoreBadge
                    score={submission.test_case_score}
                    maxScore={10}
                    className="px-1.5 py-0 text-xs"
                  >
                    {submission.test_case_score.toFixed(1)}
                  </ScoreBadge>
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="criteria" className="flex-1">
              <div className="flex items-center gap-1">
                <Compass className="h-4 w-4" />
                <span>Criteria</span>
              </div>
              {submission.criteria_score != null && (
                <span className="ml-2 inline-block">
                  <ScoreBadge
                    score={submission.criteria_score}
                    maxScore={10}
                    className="px-1.5 py-0 text-xs"
                  >
                    {submission.criteria_score.toFixed(1)}
                  </ScoreBadge>
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Test Cases Tab */}
          <TabsContent value="test-cases">
            <TestCaseEvaluation
              submission={submission}
              showSkeleton={showSkeleton}
            />
          </TabsContent>

          {/* Criteria Tab */}
          <TabsContent value="criteria">
            <CriteriaEvaluation
              submission={submission}
              showSkeleton={showSkeleton}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
