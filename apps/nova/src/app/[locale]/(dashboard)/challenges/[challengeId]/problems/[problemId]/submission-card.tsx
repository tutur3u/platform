import { fetchFullSubmission } from './actions';
import ScoreBadge from '@/components/common/ScoreBadge';
import type {
  NovaSubmissionData,
  NovaSubmissionWithScores,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import { CheckCircle2, Clock, User, XCircle } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { useEffect, useState } from 'react';

interface SubmissionCardProps {
  submission: NovaSubmissionWithScores;
  isCurrent: boolean;
}

export function SubmissionCard({ submission, isCurrent }: SubmissionCardProps) {
  const [fullSubmission, setFullSubmission] =
    useState<Partial<NovaSubmissionData>>(submission);

  useEffect(() => {
    if (!submission.id) return;
    fetchFullSubmission(submission.id).then((data) => {
      setFullSubmission((prev) => ({
        ...prev,
        ...data,
      }));
    });
  }, [submission.id]);

  return (
    <Card
      key={submission.id}
      className={`overflow-hidden ${isCurrent ? '' : 'border-muted-foreground/20'}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {submission.created_at && (
              <span className="text-xs text-muted-foreground">
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
          </div>

          {fullSubmission.total_score != null && (
            <ScoreBadge
              score={fullSubmission.total_score}
              maxScore={10}
              className="px-2 py-0"
            >
              {fullSubmission.total_score.toFixed(2)}/10
            </ScoreBadge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="mb-1 text-sm font-medium text-foreground">Prompt:</h3>
          <div className="rounded-md bg-muted p-2 text-sm">
            {submission.prompt}
          </div>
        </div>

        {/* Test Case Evaluation */}
        {fullSubmission.total_tests && fullSubmission.total_tests > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">
                Test Case Evaluation:
              </h3>
              {fullSubmission.test_case_score != null && (
                <ScoreBadge
                  score={fullSubmission.test_case_score}
                  maxScore={10}
                  className="px-2 py-0"
                >
                  {fullSubmission.test_case_score.toFixed(2)}/10
                </ScoreBadge>
              )}
            </div>
            <div className="space-y-2 rounded-md border p-4">
              <div>
                <span className="text-sm">
                  Passed {submission.passed_tests} of {submission.total_tests}{' '}
                  test cases
                </span>
              </div>
              {fullSubmission.passed_tests != null &&
                fullSubmission.total_tests != null && (
                  <Progress
                    value={
                      (fullSubmission.passed_tests /
                        fullSubmission.total_tests) *
                      100
                    }
                    className="h-2 w-full"
                    indicatorClassName={
                      fullSubmission.test_case_score != null &&
                      fullSubmission.test_case_score >= 8
                        ? 'bg-emerald-500'
                        : fullSubmission.test_case_score != null &&
                            fullSubmission.test_case_score >= 5
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    }
                  />
                )}
            </div>
          </div>
        )}

        {/* Criteria Evaluation */}
        {fullSubmission.total_criteria && fullSubmission.total_criteria > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">
                Criteria Evaluation
                {isCurrent ? '' : ': (Hover to see Feedback)'}
              </h3>
              {fullSubmission.criteria_score != null && (
                <ScoreBadge
                  score={fullSubmission.criteria_score}
                  maxScore={10}
                  className="px-2 py-0"
                >
                  {fullSubmission.criteria_score.toFixed(2)}/10
                </ScoreBadge>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {fullSubmission.criteria?.map((cs) => {
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
                        <p className="text-sm text-muted-foreground">
                          {cs.feedback}
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
