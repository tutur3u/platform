import ScoreBadge from '@/components/common/ScoreBadge';
import { EvaluationSchema as CriteriaEvaluationSchema } from '@tuturuuu/ai/chat/google-vertex/nova/criteria/schema';
import { TestCaseSchema } from '@tuturuuu/ai/chat/google-vertex/nova/test-cases/schema';
import { useObject } from '@tuturuuu/ai/object/core';
import type { NovaSubmissionWithScores } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
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
  PlayCircle,
  RefreshCw,
  User,
  XCircle,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useEffect, useState } from 'react';

interface CriterionItemProps {
  criterion: {
    id: string;
    name: string;
    result: {
      score: number;
      feedback: string;
    };
  };
}

// Separate component for criterion item to ensure proper HoverCard rendering
function CriterionItem({ criterion }: CriterionItemProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div
          className={`flex cursor-pointer items-center justify-between rounded-md border p-2 ${
            criterion.result.score >= 8
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
              : criterion.result.score >= 5
                ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {criterion.result.score >= 8 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : criterion.result.score >= 5 ? (
              <Clock className="h-4 w-4 text-amber-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm">{criterion.name}</span>
          </div>
          <ScoreBadge score={criterion.result.score} maxScore={10}>
            {criterion.result.score}/10
          </ScoreBadge>
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-4">
        <div className="space-y-2">
          <h4 className="font-medium">Feedback</h4>
          <p className="text-muted-foreground text-sm">
            {criterion.result.feedback}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

interface SubmissionCardProps {
  submission: Partial<NovaSubmissionWithScores>;
  isCurrent: boolean;
  problemId: string;
}

type Criterion = {
  id: string;
  name: string;
  result: {
    score: number;
    feedback: string;
  };
};

export function SubmissionCard({
  submission,
  isCurrent,
  problemId,
}: SubmissionCardProps) {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationStatus, setEvaluationStatus] = useState<
    'idle' | 'running' | 'completed' | 'error'
  >('idle');

  const {
    object: criteriaObject,
    submit: submitCriteria,
    isLoading: isCriteriaLoading,
  } = useObject({
    api: `/api/v1/problems/${problemId}/evaluate/criteria`,
    schema: CriteriaEvaluationSchema,
  });

  const {
    object: testCasesObject,
    submit: submitTestCases,
    isLoading: isTestCasesLoading,
  } = useObject({
    api: `/api/v1/problems/${problemId}/evaluate/test-cases`,
    schema: TestCaseSchema,
  });

  const runEvaluation = async () => {
    // Skip for current session submissions
    if (isCurrent || !submission.id || isEvaluating) return;

    try {
      setIsEvaluating(true);
      setEvaluationStatus('running');
      setEvaluationError(null);

      const promises = [];

      promises.push(
        submitCriteria({
          prompt: submission.prompt || '',
          submissionId: submission.id,
        })
      );

      promises.push(
        submitTestCases({
          prompt: submission.prompt || '',
          submissionId: submission.id,
        })
      );

      await Promise.all(promises);
      setEvaluationStatus('completed');
    } catch (error) {
      console.error('Evaluation error:', error);
      setEvaluationError(
        error instanceof Error ? error.message : 'Failed to evaluate submission'
      );
      setEvaluationStatus('error');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Initialize evaluation if needed
  useEffect(() => {
    const checkAndRunEvaluation = async () => {
      // Don't evaluate current submissions or if we're already evaluating
      if (isCurrent || !submission.id || isEvaluating) return;

      // Check if we need evaluation at all
      const criteriaEvaluated =
        submission.total_criteria === 0 ||
        (submission.criteria?.length || 0) >= (submission.total_criteria || 0);

      const testCasesEvaluated = (submission.pending_tests || 0) === 0;

      // Skip if both are already evaluated
      if (criteriaEvaluated && testCasesEvaluated) {
        setEvaluationStatus('completed');
        return;
      }

      // Run the evaluation
      await runEvaluation();
    };

    checkAndRunEvaluation();
  }, [
    submission.id,
    isCurrent,
    submission.total_criteria,
    submission.criteria?.length,
    submission.pending_tests,
    isEvaluating,
  ]);

  // Calculate scores from either submission or objects
  const criteriaScore =
    !isCurrent && criteriaObject
      ? criteriaObject.criteriaEvaluation?.reduce(
          (acc, curr) => acc + (curr?.score ?? 0),
          0
        ) || 0
      : (submission.criteria_score ?? 0);

  const totalCriteria =
    !isCurrent && criteriaObject
      ? criteriaObject.criteriaEvaluation?.length || 0
      : (submission.total_criteria ?? 0);

  const testCaseScore =
    !isCurrent && testCasesObject
      ? testCasesObject.testCaseEvaluation?.reduce(
          (acc, curr) => acc + (curr?.matched ? 1 : 0),
          0
        ) || 0
      : (submission.test_case_score ?? 0);

  const totalTests =
    !isCurrent && testCasesObject
      ? testCasesObject.testCaseEvaluation?.length || 0
      : (submission.total_tests ?? 0);

  const passedTests =
    !isCurrent && testCasesObject
      ? testCasesObject.testCaseEvaluation?.reduce(
          (acc, curr) => acc + (curr?.matched ? 1 : 0),
          0
        ) || 0
      : (submission.passed_tests ?? 0);

  // Prepare criteria list from appropriate source
  const criteriaList: Criterion[] = [];
  if (!isCurrent && criteriaObject?.criteriaEvaluation) {
    criteriaObject.criteriaEvaluation.forEach((result, i) => {
      if (result) {
        criteriaList.push({
          id: `criteria-${i}`,
          name: `Criterion ${i + 1}`,
          result: {
            score: result.score || 0,
            feedback: result.feedback || '',
          },
        });
      }
    });
  } else if (submission.criteria) {
    submission.criteria.forEach((c) => {
      if (c && c.result) {
        criteriaList.push(c as Criterion);
      }
    });
  }

  const isLoading = isCriteriaLoading || isTestCasesLoading || isEvaluating;
  const needsEvaluation = !isCurrent && submission.id && !isLoading;

  return (
    <Card
      key={submission.id}
      className={`overflow-hidden ${isCurrent ? '' : 'border-muted-foreground/20'}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
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

            {isLoading && (
              <Badge variant="secondary" className="animate-pulse text-xs">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Evaluating...
              </Badge>
            )}

            {evaluationStatus === 'error' && (
              <Badge variant="destructive" className="text-xs">
                <XCircle className="mr-1 h-3 w-3" />
                Evaluation Failed
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {needsEvaluation && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={runEvaluation}
                      disabled={isLoading}
                      className="h-8 w-8"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : evaluationStatus === 'error' ? (
                        <RefreshCw className="h-4 w-4" />
                      ) : (
                        <PlayCircle className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isLoading
                      ? 'Evaluation in progress...'
                      : evaluationStatus === 'error'
                        ? 'Retry evaluation'
                        : 'Run evaluation'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <ScoreBadge
              score={submission.total_score ?? 0}
              maxScore={10}
              className="px-2 py-0"
            >
              {submission.total_score?.toFixed(2) ?? '0.00'}/10
            </ScoreBadge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-foreground mb-1 text-sm font-medium">Prompt:</h3>
          <div className="bg-muted rounded-md p-2 text-sm">
            {submission.prompt}
          </div>
        </div>

        {evaluationError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            <div className="flex items-center justify-between">
              <span>{evaluationError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={runEvaluation}
                disabled={isLoading}
                className="h-7 border-red-300 bg-red-100 text-xs hover:bg-red-200 dark:border-red-800 dark:bg-red-900/40 dark:hover:bg-red-900/60"
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Test Case Evaluation */}
        {(totalTests > 0 || isLoading) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium">
                Test Case Evaluation:
              </h3>
              <ScoreBadge
                score={testCaseScore}
                maxScore={10}
                className="px-2 py-0"
              >
                {testCaseScore.toFixed(2)}/10
              </ScoreBadge>
            </div>
            {isLoading && totalTests === 0 ? (
              <div className="flex h-16 items-center justify-center rounded-md border">
                <div className="flex items-center gap-2">
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                  <span className="text-muted-foreground text-sm">
                    Evaluating test cases...
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border p-4">
                <div>
                  <span className="text-sm">
                    Passed {passedTests} of {totalTests} test cases
                  </span>
                </div>
                <Progress
                  value={(passedTests / Math.max(totalTests, 1)) * 100}
                  className="h-2 w-full"
                  indicatorClassName={
                    testCaseScore >= 8
                      ? 'bg-emerald-500'
                      : testCaseScore >= 5
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* Criteria Evaluation */}
        {(totalCriteria > 0 || isLoading) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium">
                Criteria Evaluation
                {isCurrent ? '' : ': (Hover to see Feedback)'}
              </h3>
              <ScoreBadge
                score={criteriaScore}
                maxScore={10}
                className="px-2 py-0"
              >
                {criteriaScore.toFixed(2)}/10
              </ScoreBadge>
            </div>
            {isLoading && criteriaList.length === 0 ? (
              <div className="flex h-16 items-center justify-center rounded-md border">
                <div className="flex items-center gap-2">
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                  <span className="text-muted-foreground text-sm">
                    Evaluating criteria...
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {criteriaList.map((criterion) => (
                  <CriterionItem key={criterion.id} criterion={criterion} />
                ))}
              </div>
            )}
          </div>
        )}

        {!isCurrent &&
          !isLoading &&
          evaluationStatus !== 'error' &&
          criteriaList.length === 0 &&
          totalTests === 0 && (
            <div className="flex flex-col items-center justify-center space-y-3 rounded-md border p-6 text-center">
              <PlayCircle className="text-muted-foreground h-8 w-8" />
              <div>
                <h4 className="font-medium">No Evaluation Results</h4>
                <p className="text-muted-foreground text-sm">
                  Click the button below to evaluate this submission
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={runEvaluation}
                className="mt-2"
              >
                <PlayCircle className="mr-2 h-4 w-4" />
                Run Evaluation
              </Button>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
