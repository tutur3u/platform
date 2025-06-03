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
            'from-dynamic-purple/5 via-dynamic-purple/8 to-dynamic-purple/10 bg-gradient-to-br',
            'border-dynamic-purple/30 hover:border-dynamic-purple/40 hover:shadow-dynamic-purple/20',
            scoreAnimation && 'scale-[1.02]'
          )}
        >
          <div className="absolute right-3 top-3">
            <Badge
              variant="outline"
              className="border-dynamic-purple/40 bg-dynamic-purple/15 text-dynamic-purple border text-xs font-medium"
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
                <div className="bg-dynamic-purple/20 flex h-16 w-16 items-center justify-center rounded-full shadow-lg">
                  <Brain className="text-dynamic-purple h-8 w-8" />
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
                  <div className="h-18 w-18 border-dynamic-purple/20 animate-pulse rounded-full border-2 opacity-60" />
                </div>
              </div>
              <div>
                <div className="text-dynamic-purple text-lg font-bold">
                  Criteria
                </div>
                <div className="text-foreground/70 text-sm font-medium">
                  Quality Score
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-dynamic-purple text-3xl font-bold">
                {evaluationPreview.criteriaScores.totalScore.toFixed(1)}
                <span className="text-foreground/60 text-xl">
                  /{evaluationPreview.criteriaScores.maxScore}
                </span>
              </div>
              <div className="text-dynamic-purple/80 text-sm font-medium">
                {evaluationPreview.criteriaScores.percentage}% quality
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-2">
              <div className="bg-dynamic-purple/20 h-3 flex-1 overflow-hidden rounded-full shadow-inner">
                <div
                  className="from-dynamic-purple via-dynamic-indigo to-dynamic-blue h-full bg-gradient-to-r shadow-sm transition-all duration-1000 ease-out"
                  style={{
                    width: `${evaluationPreview.criteriaScores.percentage}%`,
                  }}
                />
              </div>
              <Sparkles className="text-dynamic-purple h-5 w-5" />
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
          <TrendingUp className="text-dynamic-green h-4 w-4" />
          <h4 className="text-foreground font-semibold">Live Results</h4>
          <Badge variant="secondary" className="ml-auto text-xs">
            Real-time
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {evaluationPreview.criteriaEvaluation?.length && (
            <div className="border-dynamic-purple/20 bg-dynamic-purple/5 rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2">
                <Brain className="text-dynamic-purple h-4 w-4" />
                <span className="text-foreground text-sm font-medium">
                  Criteria ({evaluationPreview.criteriaEvaluation.length})
                </span>
                {evaluationPreview.criteriaScores && (
                  <Badge
                    variant="outline"
                    className="border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple ml-auto text-xs"
                  >
                    {evaluationPreview.criteriaScores.percentage}%
                  </Badge>
                )}
              </div>
              <div className="text-foreground/60 text-xs">
                Evaluation criteria being assessed in real-time
              </div>
              {evaluationPreview.criteriaScores && (
                <div className="text-dynamic-purple/80 mt-2 text-xs">
                  Score:{' '}
                  {evaluationPreview.criteriaScores.totalScore.toFixed(1)}/
                  {evaluationPreview.criteriaScores.maxScore}
                </div>
              )}
            </div>
          )}

          {evaluationPreview.testCaseResults?.length && (
            <div className="border-dynamic-indigo/20 bg-dynamic-indigo/5 rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2">
                <FlaskConical className="text-dynamic-indigo h-4 w-4" />
                <span className="text-foreground text-sm font-medium">
                  Test Cases ({evaluationPreview.testCaseResults.length})
                </span>
                {evaluationPreview.testCaseScores && (
                  <Badge
                    variant="outline"
                    className="border-dynamic-indigo/30 bg-dynamic-indigo/10 text-dynamic-indigo ml-auto text-xs"
                  >
                    {evaluationPreview.generationPhase
                      ? `${evaluationPreview.testCaseResults.length}/${evaluationPreview.testCaseScores.total}`
                      : `${evaluationPreview.testCaseScores.passed}/${evaluationPreview.testCaseScores.total}`}
                  </Badge>
                )}
              </div>
              <div className="text-foreground/60 text-xs">
                {evaluationPreview.generationPhase
                  ? 'Test case outputs being generated'
                  : 'Test case outputs being evaluated'}
              </div>
              {evaluationPreview.testCaseScores &&
                evaluationPreview.testCaseScores.total > 0 && (
                  <div className="mt-2 space-y-1">
                    {!evaluationPreview.generationPhase && (
                      <div className="text-dynamic-indigo/80 text-xs">
                        Pass Rate: {evaluationPreview.testCaseScores.percentage}
                        %
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <div className="bg-dynamic-indigo/20 h-1 flex-1 overflow-hidden rounded-full">
                        <div
                          className={cn(
                            'h-full transition-all duration-500 ease-out',
                            evaluationPreview.generationPhase
                              ? 'from-dynamic-indigo to-dynamic-blue bg-gradient-to-r'
                              : 'from-dynamic-indigo to-dynamic-green bg-gradient-to-r'
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
                          <CheckCircle className="text-dynamic-green h-3 w-3" />
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
                                      ? 'bg-dynamic-blue animate-pulse'
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
                                className="bg-foreground/20 h-2 w-2 rounded-full transition-all duration-300"
                                title={`Test Case ${
                                  (evaluationPreview?.testCaseResults?.length ||
                                    0) +
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
