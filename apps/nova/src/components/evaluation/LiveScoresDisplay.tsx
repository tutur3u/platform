'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Brain,
  CheckCircle,
  FlaskConical,
  Sparkles,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';

interface EvaluationPreview {
  criteriaEvaluation?: any[];
  testCaseResults?: any[];
  submissionId?: string;
  overallAssessment?: string;
  testCaseScores?: {
    passed: number;
    total: number;
    percentage: number;
  };
  criteriaScores?: {
    totalScore: number;
    maxScore: number;
    percentage: number;
  };
  generationPhase?: boolean;
}

interface LiveScoresDisplayProps {
  evaluationPreview: EvaluationPreview;
}

export function LiveScoresDisplay({
  evaluationPreview,
}: LiveScoresDisplayProps) {
  const [scoreAnimation, setScoreAnimation] = useState(false);

  // Trigger animation when scores change
  useEffect(() => {
    if (evaluationPreview.testCaseScores || evaluationPreview.criteriaScores) {
      setScoreAnimation(true);
      const timer = setTimeout(() => setScoreAnimation(false), 600);
      return () => clearTimeout(timer);
    }
  }, [
    evaluationPreview.testCaseScores?.percentage,
    evaluationPreview.criteriaScores?.percentage,
  ]);

  // Don't show anything if there's no meaningful data yet
  if (!evaluationPreview.testCaseScores && !evaluationPreview.criteriaScores) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Enhanced Criteria Score */}
      {evaluationPreview.criteriaScores && (
        <div
          className={cn(
            'relative overflow-hidden rounded-xl border-2 p-6 shadow-lg transition-all duration-500',
            'bg-gradient-to-br from-dynamic-purple/5 via-dynamic-purple/8 to-dynamic-purple/10',
            'border-dynamic-purple/30 hover:border-dynamic-purple/40 hover:shadow-dynamic-purple/20',
            scoreAnimation && 'scale-[1.02]'
          )}
        >
          <div className="absolute top-3 right-3">
            <Badge
              variant="outline"
              className="border border-dynamic-purple/40 bg-dynamic-purple/15 text-xs font-medium text-dynamic-purple"
            >
              <div className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Analysis
              </div>
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-dynamic-purple/20 shadow-lg">
                  <Brain className="h-8 w-8 text-dynamic-purple" />
                </div>
                <div className="absolute -inset-2">
                  <svg
                    className="h-20 w-20 -rotate-90 transform"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      className="text-dynamic-purple/20"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      strokeLinecap="round"
                      className="text-dynamic-purple transition-all duration-1000 ease-out"
                      style={{
                        strokeDasharray: '251.2',
                        strokeDashoffset: `${251.2 - (251.2 * evaluationPreview.criteriaScores.percentage) / 100}`,
                      }}
                    />
                  </svg>
                </div>
                <div className="absolute -inset-1">
                  <div className="h-18 w-18 animate-pulse rounded-full border-2 border-dynamic-purple/20 opacity-60" />
                </div>
              </div>
              <div>
                <div className="text-lg font-bold text-dynamic-purple">
                  Criteria
                </div>
                <div className="text-sm font-medium text-foreground/70">
                  Quality Score
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-dynamic-purple">
                {evaluationPreview.criteriaScores.totalScore.toFixed(1)}
                <span className="text-xl text-foreground/60">
                  /{evaluationPreview.criteriaScores.maxScore}
                </span>
              </div>
              <div className="text-sm font-medium text-dynamic-purple/80">
                {evaluationPreview.criteriaScores.percentage}% quality
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-2">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-dynamic-purple/20 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-dynamic-purple via-dynamic-indigo to-dynamic-blue shadow-sm transition-all duration-1000 ease-out"
                  style={{
                    width: `${evaluationPreview.criteriaScores.percentage}%`,
                  }}
                />
              </div>
              <Sparkles className="h-5 w-5 text-dynamic-purple" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface LiveResultsPreviewProps {
  evaluationPreview: EvaluationPreview;
}

export function LiveResultsPreview({
  evaluationPreview,
}: LiveResultsPreviewProps) {
  // Don't show if there's no data to preview
  if (
    !evaluationPreview.criteriaEvaluation?.length &&
    !evaluationPreview.testCaseResults?.length
  ) {
    return null;
  }

  return (
    <>
      <Separator className="bg-dynamic-green/20" />
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-dynamic-green" />
          <h4 className="font-semibold text-foreground">Live Results</h4>
          <Badge variant="secondary" className="ml-auto text-xs">
            Real-time
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {evaluationPreview.criteriaEvaluation?.length && (
            <div className="rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Brain className="h-4 w-4 text-dynamic-purple" />
                <span className="text-sm font-medium text-foreground">
                  Criteria ({evaluationPreview.criteriaEvaluation.length})
                </span>
                {evaluationPreview.criteriaScores && (
                  <Badge
                    variant="outline"
                    className="ml-auto border-dynamic-purple/30 bg-dynamic-purple/10 text-xs text-dynamic-purple"
                  >
                    {evaluationPreview.criteriaScores.percentage}%
                  </Badge>
                )}
              </div>
              <div className="text-xs text-foreground/60">
                Evaluation criteria being assessed in real-time
              </div>
              {evaluationPreview.criteriaScores && (
                <div className="mt-2 text-xs text-dynamic-purple/80">
                  Score:{' '}
                  {evaluationPreview.criteriaScores.totalScore.toFixed(1)}/
                  {evaluationPreview.criteriaScores.maxScore}
                </div>
              )}
            </div>
          )}

          {evaluationPreview.testCaseResults?.length && (
            <div className="rounded-lg border border-dynamic-indigo/20 bg-dynamic-indigo/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-dynamic-indigo" />
                <span className="text-sm font-medium text-foreground">
                  Test Cases ({evaluationPreview.testCaseResults.length})
                </span>
                {evaluationPreview.testCaseScores && (
                  <Badge
                    variant="outline"
                    className="ml-auto border-dynamic-indigo/30 bg-dynamic-indigo/10 text-xs text-dynamic-indigo"
                  >
                    {evaluationPreview.generationPhase
                      ? `${evaluationPreview.testCaseResults.length}/${evaluationPreview.testCaseScores.total}`
                      : `${evaluationPreview.testCaseScores.passed}/${evaluationPreview.testCaseScores.total}`}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-foreground/60">
                {evaluationPreview.generationPhase
                  ? 'Test case outputs being generated'
                  : 'Test case outputs being evaluated'}
              </div>
              {evaluationPreview.testCaseScores &&
                evaluationPreview.testCaseScores.total > 0 && (
                  <div className="mt-2 space-y-1">
                    {!evaluationPreview.generationPhase && (
                      <div className="text-xs text-dynamic-indigo/80">
                        Pass Rate: {evaluationPreview.testCaseScores.percentage}
                        %
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-dynamic-indigo/20">
                        <div
                          className={cn(
                            'h-full transition-all duration-500 ease-out',
                            evaluationPreview.generationPhase
                              ? 'bg-gradient-to-r from-dynamic-indigo to-dynamic-blue'
                              : 'bg-gradient-to-r from-dynamic-indigo to-dynamic-green'
                          )}
                          style={{
                            width: evaluationPreview.generationPhase
                              ? `${((evaluationPreview.testCaseResults.length || 0) / evaluationPreview.testCaseScores.total) * 100}%`
                              : `${evaluationPreview.testCaseScores.percentage}%`,
                          }}
                        />
                      </div>
                      {!evaluationPreview.generationPhase &&
                        evaluationPreview.testCaseScores.passed > 0 && (
                          <CheckCircle className="h-3 w-3 text-dynamic-green" />
                        )}
                    </div>
                    {/* Individual test case indicators */}
                    {evaluationPreview.testCaseResults.length <= 10 &&
                      evaluationPreview.testCaseResults.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {evaluationPreview.testCaseResults.map(
                            (testCase: any, index: number) => {
                              // Check if this test case has match data
                              const hasMatchData =
                                testCase &&
                                typeof testCase.matched === 'boolean';
                              const isPassed = hasMatchData
                                ? testCase.matched
                                : false;
                              const isProcessing =
                                !hasMatchData &&
                                index < evaluationPreview.testCaseScores!.total;
                              const isGenerating =
                                evaluationPreview.generationPhase;

                              return (
                                <div
                                  key={testCase?.id || index}
                                  className={cn(
                                    'h-2 w-2 rounded-full transition-all duration-300',
                                    isGenerating
                                      ? 'animate-pulse bg-dynamic-blue'
                                      : isPassed
                                        ? 'bg-dynamic-green'
                                        : hasMatchData
                                          ? 'bg-dynamic-red'
                                          : isProcessing
                                            ? 'bg-dynamic-amber animate-pulse'
                                            : 'bg-foreground/20'
                                  )}
                                  title={
                                    isGenerating
                                      ? `Test Case ${index + 1}: Generating...`
                                      : hasMatchData
                                        ? `Test Case ${index + 1}: ${isPassed ? 'Passed' : 'Failed'}`
                                        : isProcessing
                                          ? `Test Case ${index + 1}: Processing...`
                                          : `Test Case ${index + 1}: Pending`
                                  }
                                />
                              );
                            }
                          )}
                          {/* Show additional pending indicators if total > current results */}
                          {evaluationPreview.testCaseScores!.total >
                            evaluationPreview.testCaseResults.length &&
                            Array.from({
                              length:
                                evaluationPreview.testCaseScores!.total -
                                evaluationPreview.testCaseResults.length,
                            }).map((_, index) => (
                              <div
                                key={`pending-${index}`}
                                className="h-2 w-2 rounded-full bg-foreground/20 transition-all duration-300"
                                title={`Test Case ${
                                  (
                                    evaluationPreview?.testCaseResults
                                      ?.length || 0
                                  ) +
                                  index +
                                  1
                                }: Pending`}
                              />
                            ))}
                        </div>
                      )}
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
