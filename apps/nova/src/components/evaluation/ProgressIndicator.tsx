'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Cog,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';
import {
  CATEGORY_CONFIG,
  calculateOverallProgress,
  getActiveSteps,
  getCategoryStatus,
  getCurrentStepInfo,
  getStepsByCategory,
  type ProgressUpdate,
  STEP_CONFIG,
} from '@/lib/streaming';

interface EvaluationPreview {
  criteriaEvaluation?: Array<{ score?: number; [key: string]: unknown }>;
  testCaseResults?: Array<{ [key: string]: unknown }>;
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

interface ProgressIndicatorProps {
  isSubmitting: boolean;
  currentProgress: ProgressUpdate | null;
  isEvaluationComplete: boolean;
  evaluationSteps: ProgressUpdate[];
  evaluationPreview: EvaluationPreview;
  expandedCategories: Set<string>;
  onToggleCategory: (category: string) => void;
}

export function ProgressIndicator({
  isSubmitting,
  currentProgress,
  isEvaluationComplete,
  evaluationSteps,
  expandedCategories,
  onToggleCategory,
}: ProgressIndicatorProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [completionAnimation, setCompletionAnimation] = useState(false);

  // Control visibility with animation
  useEffect(() => {
    if (isSubmitting || currentProgress || isEvaluationComplete) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isSubmitting, currentProgress, isEvaluationComplete]);

  // Trigger completion animation
  useEffect(() => {
    if (isEvaluationComplete) {
      setCompletionAnimation(true);
      const timer = setTimeout(() => setCompletionAnimation(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isEvaluationComplete]);

  if (!isVisible) return null;

  const activeSteps = getActiveSteps(evaluationSteps);
  const overallProgress = isEvaluationComplete
    ? 100
    : calculateOverallProgress(evaluationSteps);
  const stepCategories = getStepsByCategory(evaluationSteps);
  const currentStepInfo = getCurrentStepInfo(evaluationSteps);

  const isError = currentProgress?.step === 'error';
  const isWarning = currentProgress?.step === 'parsing_error';

  return (
    <Card
      className={cn(
        'transform transition-all duration-700 ease-out',
        'border bg-gradient-to-br from-background/95 via-background/98 to-background/95',
        'shadow-lg backdrop-blur-sm',
        isEvaluationComplete
          ? 'scale-[1.01] border-dynamic-green/30 shadow-2xl shadow-dynamic-green/20'
          : isError
            ? 'border-dynamic-red/30 shadow-dynamic-red/20'
            : isWarning
              ? 'border-dynamic-amber/30 shadow-dynamic-amber/20'
              : 'border-dynamic-blue/30 shadow-dynamic-blue/20',
        completionAnimation && 'animate-pulse',
        !isVisible && 'scale-95 opacity-0'
      )}
    >
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-3 text-xl text-foreground">
          {isEvaluationComplete ? (
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-green/90 shadow-lg">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div className="absolute inset-0 animate-ping">
                  <div className="h-8 w-8 rounded-full bg-dynamic-green/60" />
                </div>
              </div>
              <span className="to-dynamic-emerald bg-gradient-to-r from-dynamic-green bg-clip-text font-bold text-transparent">
                ✨ Evaluation Complete!
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-blue/90 shadow-lg">
                  <LoadingIndicator className="h-5 w-5 text-white" />
                </div>
                <div className="absolute inset-0">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-dynamic-blue/30 border-t-transparent opacity-60" />
                </div>
              </div>
              <span className="bg-gradient-to-r from-dynamic-blue via-dynamic-purple to-dynamic-indigo bg-clip-text font-bold text-transparent">
                🤖 AI Evaluation in Progress
              </span>
            </div>
          )}
        </CardTitle>
        <CardDescription className="flex items-center justify-between text-base text-foreground/70">
          <span>
            {isEvaluationComplete
              ? '🎉 Your prompt has been successfully evaluated and results are ready to view!'
              : currentProgress?.message ||
                'AI models are analyzing your prompt...'}
          </span>
          {currentStepInfo.timestamp && (
            <span className="text-xs text-foreground/50">
              {currentStepInfo.timestamp}
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Main Progress Display */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold text-foreground">
                {Math.round(overallProgress)}%
              </div>
            </div>
            {currentStepInfo.currentStep && (
              <div className="text-right">
                <Badge
                  variant="outline"
                  className={cn(
                    'border px-3 py-1',
                    STEP_CONFIG[currentStepInfo.currentStep.step]?.category ===
                      'ai-processing' &&
                      'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
                    STEP_CONFIG[currentStepInfo.currentStep.step]?.category ===
                      'setup' &&
                      'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
                    STEP_CONFIG[currentStepInfo.currentStep.step]?.category ===
                      'validation' &&
                      'border-dynamic-amber/30 bg-dynamic-amber/10 text-dynamic-amber',
                    STEP_CONFIG[currentStepInfo.currentStep.step]?.category ===
                      'finalization' &&
                      'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
                  )}
                >
                  {STEP_CONFIG[currentStepInfo.currentStep.step]?.label ||
                    currentStepInfo.currentStep.step}
                </Badge>
              </div>
            )}
          </div>

          <div className="relative">
            <Progress
              value={overallProgress}
              className="h-4 border border-dynamic-blue/20 bg-background"
              indicatorClassName={cn(
                'transition-all duration-700 ease-out',
                isEvaluationComplete
                  ? 'bg-dynamic-green'
                  : isError
                    ? 'bg-dynamic-red'
                    : isWarning
                      ? 'bg-dynamic-amber'
                      : 'bg-gradient-to-r from-dynamic-blue via-dynamic-purple to-dynamic-indigo'
              )}
            />
            {!isEvaluationComplete && overallProgress > 0 && (
              <div className="absolute inset-0 overflow-hidden rounded-full">
                <div
                  className="h-full animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            )}
          </div>

          {/* Current Step Details */}
          {currentStepInfo.currentStep && !isEvaluationComplete && (
            <div
              className={cn(
                'rounded-lg border p-4',
                currentStepInfo.currentStep.step === 'parsing_error'
                  ? 'border-dynamic-amber/20 bg-dynamic-amber/5'
                  : currentStepInfo.currentStep.step === 'error'
                    ? 'border-dynamic-red/20 bg-dynamic-red/5'
                    : 'border-dynamic-blue/20 bg-dynamic-blue/5'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border',
                    currentStepInfo.currentStep.step === 'parsing_error'
                      ? 'border-dynamic-amber/30 bg-dynamic-amber/20'
                      : currentStepInfo.currentStep.step === 'error'
                        ? 'border-dynamic-red/30 bg-dynamic-red/20'
                        : 'border-dynamic-blue/30 bg-dynamic-blue/20'
                  )}
                >
                  {currentStepInfo.currentStep.step === 'parsing_error' ? (
                    <AlertCircle className="text-dynamic-amber h-5 w-5" />
                  ) : currentStepInfo.currentStep.step === 'error' ? (
                    <AlertCircle className="h-5 w-5 text-dynamic-red" />
                  ) : (
                    <LoadingIndicator className="h-5 w-5 text-dynamic-blue" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    {STEP_CONFIG[currentStepInfo.currentStep.step]?.label ||
                      currentStepInfo.currentStep.step}
                  </div>
                  <div
                    className={cn(
                      'text-sm',
                      currentStepInfo.currentStep.step === 'parsing_error'
                        ? 'text-dynamic-amber/80'
                        : currentStepInfo.currentStep.step === 'error'
                          ? 'text-dynamic-red/80'
                          : 'text-foreground/70'
                    )}
                  >
                    {currentStepInfo.currentStep.message}
                  </div>
                  {STEP_CONFIG[currentStepInfo.currentStep.step]
                    ?.description && (
                    <div className="mt-1 text-xs text-foreground/60">
                      {
                        STEP_CONFIG[currentStepInfo.currentStep.step]
                          ?.description
                      }
                    </div>
                  )}
                  {currentStepInfo.currentStep.step === 'parsing_error' && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="bg-dynamic-amber h-1 w-1 animate-pulse rounded-full" />
                      <div className="bg-dynamic-amber animation-delay-200 h-1 w-1 animate-pulse rounded-full" />
                      <div className="bg-dynamic-amber animation-delay-400 h-1 w-1 animate-pulse rounded-full" />
                      <span className="text-dynamic-amber/70 text-xs">
                        Evaluation is continuing despite communication issues
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Category Progress */}
        {activeSteps.length > 3 && (
          <>
            <Separator className="bg-foreground/10" />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Cog className="h-4 w-4 text-foreground/60" />
                <h4 className="font-semibold text-foreground">
                  Detailed Progress
                </h4>
                <Badge variant="outline" className="ml-auto text-xs">
                  {
                    Object.keys(stepCategories).filter(
                      (cat) =>
                        stepCategories[cat as keyof typeof stepCategories]
                          .length > 0
                    ).length
                  }{' '}
                  categories
                </Badge>
              </div>

              {Object.entries(stepCategories).map(
                ([category, categorySteps]) => {
                  if (categorySteps.length === 0) return null;

                  const categoryConfig =
                    CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
                  const status = getCategoryStatus(category, evaluationSteps);
                  const isExpanded = expandedCategories.has(category);

                  return (
                    <Collapsible
                      key={category}
                      open={isExpanded}
                      onOpenChange={() => onToggleCategory(category)}
                    >
                      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg border border-foreground/10 bg-background/60 p-3 text-left transition-all hover:bg-background/80">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-full border text-xs transition-all',
                              status.isComplete
                                ? 'border-dynamic-green bg-dynamic-green text-white'
                                : status.isActive
                                  ? `border-dynamic-${categoryConfig.color} bg-dynamic-${categoryConfig.color}/20 text-dynamic-${categoryConfig.color}`
                                  : 'border-foreground/20 bg-background text-foreground/60'
                            )}
                          >
                            {status.isComplete ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : status.isActive ? (
                              <Clock className="h-3 w-3" />
                            ) : (
                              <Clock className="h-3 w-3" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {categoryConfig.label}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-foreground/60 transition-transform group-hover:text-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-foreground/60 transition-transform group-hover:text-foreground" />
                          )}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-1 px-3">
                        {categorySteps.map((step, index) => {
                          const isActive = step.step === currentProgress?.step;
                          const isCompleted =
                            step.progress === 100 ||
                            step.step.includes('completed');
                          const stepConfig = STEP_CONFIG[step.step];

                          return (
                            <div
                              key={`${step.step}-${index}`}
                              className={cn(
                                'flex items-center gap-3 rounded-md p-2 text-sm transition-all',
                                isActive && 'bg-dynamic-blue/10',
                                isCompleted &&
                                  !isActive &&
                                  'text-foreground/70',
                                !isActive &&
                                  !isCompleted &&
                                  'text-foreground/60'
                              )}
                            >
                              <div
                                className={cn(
                                  'flex h-4 w-4 items-center justify-center rounded-full text-xs',
                                  isCompleted
                                    ? 'text-dynamic-green'
                                    : isActive
                                      ? 'text-dynamic-blue'
                                      : 'text-foreground/40'
                                )}
                              >
                                {isCompleted ? (
                                  <CheckCircle className="h-3 w-3" />
                                ) : (
                                  <Clock className="h-3 w-3" />
                                )}
                              </div>
                              <span className="flex-1 truncate">
                                {stepConfig?.label || step.step}
                              </span>
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                }
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
