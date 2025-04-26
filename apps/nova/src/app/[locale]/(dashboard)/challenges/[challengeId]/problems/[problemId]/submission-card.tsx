import HoverCard from '@/app/[locale]/(marketing)/hover-card';
import ScoreBadge from '@/components/common/ScoreBadge';
import type { NovaSubmissionWithScores } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { HoverCardContent, HoverCardTrigger } from '@tuturuuu/ui/hover-card';
import { CheckCircle2, Clock, User, XCircle } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';

interface SubmissionCardProps {
  submission: Partial<NovaSubmissionWithScores>;
  isCurrent: boolean;
}

export function SubmissionCard({ submission, isCurrent }: SubmissionCardProps) {
  return (
    <Card
      key={submission.id}
      className={`overflow-hidden ${isCurrent ? '' : 'border-muted-foreground/20'}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">
              <Clock className="mr-1 inline h-3 w-3" />
              {submission.created_at
                ? new Date(submission.created_at).toLocaleString()
                : 'Unknown'}
            </span>

            {!isCurrent && (
              <Badge variant="outline" className="text-xs">
                <User className="mr-1 h-3 w-3" />
                Past Session
              </Badge>
            )}
          </div>

          <ScoreBadge
            score={submission.total_score ?? 0}
            maxScore={10}
            className="px-2 py-0"
          >
            {submission.total_score?.toFixed(2) ?? '0.00'}/10
          </ScoreBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-foreground mb-1 text-sm font-medium">Prompt:</h3>
          <div className="bg-muted rounded-md p-2 text-sm">
            {submission.prompt}
          </div>
        </div>

        {/* Test Case Evaluation */}
        {submission.total_tests && submission.total_tests > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium">
                Test Case Evaluation:
              </h3>
              <ScoreBadge
                score={submission.test_case_score ?? 0}
                maxScore={10}
                className="px-2 py-0"
              >
                {submission.test_case_score?.toFixed(2) ?? '0.00'}/10
              </ScoreBadge>
            </div>
            <div className="space-y-2 rounded-md border p-4">
              <div>
                <span className="text-sm">
                  Passed {submission.passed_tests} of {submission.total_tests}{' '}
                  test cases
                </span>
              </div>
              <Progress
                value={
                  (submission.passed_tests ?? 0) / (submission.total_tests ?? 0)
                }
                className="h-2 w-full"
                indicatorClassName={
                  (submission.test_case_score ?? 0) >= 8
                    ? 'bg-emerald-500'
                    : (submission.test_case_score ?? 0) >= 5
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }
              />
            </div>
          </div>
        )}

        {/* Criteria Evaluation */}
        {submission.total_criteria && submission.total_criteria > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium">
                Criteria Evaluation
                {isCurrent ? '' : ': (Hover to see Feedback)'}
              </h3>
              <ScoreBadge
                score={submission.criteria_score ?? 0}
                maxScore={10}
                className="px-2 py-0"
              >
                {submission.criteria_score?.toFixed(2) ?? '0.00'}/10
              </ScoreBadge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {submission.criteria?.map((cs) => {
                if (!cs || !cs.result) return null;

                return (
                  <HoverCard key={cs.id}>
                    <HoverCardTrigger asChild>
                      <div
                        className={`flex cursor-pointer items-center justify-between rounded-md border p-2 ${
                          cs.result.score >= 8
                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                            : cs.result.score >= 5
                              ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                              : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {cs.result.score >= 8 ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : cs.result.score >= 5 ? (
                            <Clock className="h-4 w-4 text-amber-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">{cs.name}</span>
                        </div>
                        <ScoreBadge score={cs.result.score} maxScore={10}>
                          {cs.result.score}/10
                        </ScoreBadge>
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80 p-4">
                      <div className="space-y-2">
                        <h4 className="font-medium">Feedback</h4>
                        <p className="text-muted-foreground text-sm">
                          {cs.result.feedback}
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
