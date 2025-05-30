'use client';

import { getFullSubmission } from './actions';
import { SubmissionCard } from '@/components/common/SubmissionCard';
import {
  CATEGORY_CONFIG,
  ProgressUpdate,
  STEP_CONFIG,
  calculateOverallProgress,
  evaluatePromptStreaming,
  getActiveSteps,
  getCategoryStatus,
  getCurrentStepInfo,
  getStepsByCategory,
} from '@/lib/streaming';
import {
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
  NovaSubmissionData,
  NovaSubmissionWithScores,
} from '@tuturuuu/types/db';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  AlertCircle,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Cog,
  FlaskConical,
  PlayCircle,
  Plus,
  Sparkles,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  problem: NovaProblem & {
    test_cases: NovaProblemTestCase[];
  };
  session?: NovaSession;
  submissions: NovaSubmissionWithScores[];
}

type EnrichedSubmission = NovaSubmissionWithScores &
  Partial<NovaSubmissionData>;

interface EvaluationPreview {
  criteriaEvaluation?: any[];
  testCaseResults?: any[];
  submissionId?: string;
  overallAssessment?: string;
}

const MAX_ATTEMPTS = 3;

export default function PromptForm({ problem, session, submissions }: Props) {
  const router = useRouter();

  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('prompt');
  const [submissionsTab, setSubmissionsTab] = useState('current');

  // Enhanced streaming evaluation state
  const [currentProgress, setCurrentProgress] = useState<ProgressUpdate | null>(
    null
  );
  const [evaluationPreview, setEvaluationPreview] = useState<EvaluationPreview>(
    {}
  );
  const [evaluationSteps, setEvaluationSteps] = useState<ProgressUpdate[]>([]);
  const [isEvaluationComplete, setIsEvaluationComplete] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['ai-processing'])
  );

  // Submission data management
  const [enrichedSubmissions, setEnrichedSubmissions] = useState<
    Record<string, EnrichedSubmission>
  >({});
  const [loadingSubmissions, setLoadingSubmissions] = useState<Set<string>>(
    new Set()
  );
  const submissionQueueRef = useRef<string[]>([]);
  const isFetchingRef = useRef(false);

  const isAdmin = !session;

  // Split submissions between current and past sessions
  const currentSubmissions = submissions.filter(
    (s) => s.session_id === session?.id
  );

  const pastSubmissions = submissions.filter(
    (s) => s.session_id !== session?.id
  );

  const remainingAttempts = isAdmin
    ? null
    : Math.max(MAX_ATTEMPTS - currentSubmissions.length, 0);

  const getSubmissions = useCallback(async () => {
    router.refresh();
  }, [problem.id, session?.id, router]);

  // Process the submission queue
  const processQueue = useCallback(async () => {
    if (isFetchingRef.current || submissionQueueRef.current.length === 0)
      return;

    isFetchingRef.current = true;
    const submissionId = submissionQueueRef.current[0];

    if (!submissionId) {
      isFetchingRef.current = false;
      return;
    }

    setLoadingSubmissions((prev) => {
      const newSet = new Set(prev);
      newSet.add(submissionId);
      return newSet;
    });

    try {
      const data = await getFullSubmission(submissionId, isAdmin);
      if (data) {
        const submission = submissions.find((s) => s.id === submissionId);
        if (submission) {
          setEnrichedSubmissions((prev) => ({
            ...prev,
            [submissionId]: {
              ...submission,
              ...data,
            },
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching submission details:', error);
    } finally {
      submissionQueueRef.current.shift();
      setLoadingSubmissions((prev) => {
        const newSet = new Set(prev);
        if (submissionId) {
          newSet.delete(submissionId);
        }
        return newSet;
      });
      isFetchingRef.current = false;

      if (submissionQueueRef.current.length > 0) {
        processQueue();
      }
    }
  }, [submissions]);

  const requestFetchSubmission = useCallback(
    (submissionId: string) => {
      if (
        enrichedSubmissions[submissionId]?.criteria ||
        submissionQueueRef.current.includes(submissionId) ||
        loadingSubmissions.has(submissionId)
      )
        return;

      submissionQueueRef.current.push(submissionId);

      if (!isFetchingRef.current) {
        processQueue();
      }
    },
    [enrichedSubmissions, loadingSubmissions, processQueue]
  );

  useEffect(() => {
    if (activeTab === 'submissions') {
      const visibleSubmissions =
        submissionsTab === 'current' ? currentSubmissions : pastSubmissions;

      if (visibleSubmissions && visibleSubmissions.length > 0) {
        submissionQueueRef.current = [];
        visibleSubmissions.slice(0, 3).forEach((submission) => {
          if (submission.id && !enrichedSubmissions[submission.id]?.criteria) {
            requestFetchSubmission(submission.id);
          }
        });
      }
    }
  }, [
    activeTab,
    submissionsTab,
    currentSubmissions,
    pastSubmissions,
    enrichedSubmissions,
    requestFetchSubmission,
  ]);

  useEffect(() => {
    getSubmissions();
  }, [getSubmissions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleProgressUpdate = useCallback((progressData: ProgressUpdate) => {
    setCurrentProgress(progressData);

    setEvaluationSteps((prev) => {
      const newSteps = [...prev];
      const existingIndex = newSteps.findIndex(
        (step) => step.step === progressData.step
      );
      if (existingIndex !== -1) {
        newSteps[existingIndex] = progressData;
      } else {
        newSteps.push(progressData);
      }
      return newSteps;
    });

    // Auto-expand categories when they become active
    const stepCategory = STEP_CONFIG[progressData.step]?.category;
    if (stepCategory && progressData.progress > 0) {
      setExpandedCategories((prev) => new Set(prev).add(stepCategory));
    }

    // Update evaluation preview with streaming data
    if (progressData.data?.partialEvaluation) {
      setEvaluationPreview((prev) => ({
        ...prev,
        criteriaEvaluation:
          progressData.data.partialEvaluation.criteriaEvaluation,
      }));
    }

    if (progressData.data?.evaluation) {
      setEvaluationPreview((prev) => ({
        ...prev,
        criteriaEvaluation: progressData.data.evaluation.criteriaEvaluation,
        overallAssessment: progressData.data.evaluation.overallAssessment,
      }));
    }

    if (progressData.data?.partialResults) {
      setEvaluationPreview((prev) => ({
        ...prev,
        testCaseResults: progressData.data.partialResults,
      }));
    }

    if (progressData.data?.testCaseResults) {
      setEvaluationPreview((prev) => ({
        ...prev,
        testCaseResults: progressData.data.testCaseResults,
      }));
    }

    if (progressData.data?.submissionId) {
      setEvaluationPreview((prev) => ({
        ...prev,
        submissionId: progressData.data.submissionId,
      }));
    }

    if (progressData.step === 'completed') {
      setIsEvaluationComplete(true);
      setActiveTab('submissions');
      setSubmissionsTab('current');

      toast({
        title: '🎉 Evaluation completed successfully!',
        description:
          'Your prompt has been evaluated and results are available.',
      });

      // Auto-hide progress after completion
      setTimeout(() => {
        setIsEvaluationComplete(false);
        setCurrentProgress(null);
        setEvaluationSteps([]);
        setEvaluationPreview({});
        setExpandedCategories(new Set(['ai-processing']));
      }, 3000);
    }
  }, []);

  const handleSend = async () => {
    if (!prompt.trim()) {
      setError('Prompt cannot be empty.');
      return;
    }

    if (prompt.length > problem.max_prompt_length) {
      setError('Prompt length exceeds the maximum allowed length.');
      return;
    }

    if (remainingAttempts === 0) {
      setError(
        `You have reached the maximum number of attempts (${MAX_ATTEMPTS}).`
      );
      return;
    }

    if (isSubmitting) {
      setError('Please wait for the previous attempt to complete.');
      return;
    }

    const currentPrompt = prompt;
    setPrompt('');
    setIsSubmitting(true);
    setError('');
    setCurrentProgress(null);
    setEvaluationPreview({});
    setEvaluationSteps([]);
    setIsEvaluationComplete(false);
    setExpandedCategories(new Set(['ai-processing']));

    try {
      await evaluatePromptStreaming(
        problem.id,
        currentPrompt,
        session?.id,
        handleProgressUpdate,
        (error) => {
          console.error('Streaming error:', error);
          toast({
            title: '❌ Evaluation Error',
            description: error.message,
            variant: 'destructive',
          });
        }
      );
    } catch (error) {
      console.error('Error submitting prompt:', error);
      toast({
        title: '❌ Submission Failed',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to submit prompt. Please try again.',
        variant: 'destructive',
      });
    } finally {
      getSubmissions();
      setIsSubmitting(false);
    }
  };

  const getSubmissionData = (
    submission: NovaSubmissionWithScores
  ): EnrichedSubmission => {
    return submission.id
      ? enrichedSubmissions[submission.id] || submission
      : submission;
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const renderEnhancedProgressIndicator = () => {
    if (!isSubmitting && !currentProgress && !isEvaluationComplete) return null;

    const activeSteps = getActiveSteps(evaluationSteps);
    const overallProgress = isEvaluationComplete
      ? 100
      : calculateOverallProgress(evaluationSteps);
    const stepCategories = getStepsByCategory(evaluationSteps);
    const currentStepInfo = getCurrentStepInfo(evaluationSteps);

    return (
      <Card
        className={cn(
          'mb-6 transition-all duration-500 ease-in-out',
          'border bg-background/95 shadow-lg backdrop-blur-sm',
          isEvaluationComplete
            ? 'border-dynamic-green/20 shadow-dynamic-green/10'
            : 'border-dynamic-blue/20 shadow-dynamic-blue/10'
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
                      STEP_CONFIG[currentStepInfo.currentStep.step]
                        ?.category === 'ai-processing' &&
                        'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
                      STEP_CONFIG[currentStepInfo.currentStep.step]
                        ?.category === 'setup' &&
                        'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
                      STEP_CONFIG[currentStepInfo.currentStep.step]
                        ?.category === 'validation' &&
                        'border-dynamic-amber/30 bg-dynamic-amber/10 text-dynamic-amber',
                      STEP_CONFIG[currentStepInfo.currentStep.step]
                        ?.category === 'finalization' &&
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
                    : currentProgress?.step === 'error'
                      ? 'bg-dynamic-red'
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
              <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dynamic-blue/30 bg-dynamic-blue/20">
                    <LoadingIndicator className="h-5 w-5 text-dynamic-blue" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {STEP_CONFIG[currentStepInfo.currentStep.step]?.label ||
                        currentStepInfo.currentStep.step}
                    </div>
                    <div className="text-sm text-foreground/70">
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
                        onOpenChange={() => toggleCategory(category)}
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
                            const isActive =
                              step.step === currentProgress?.step;
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

          {/* Live Results Preview */}
          {(evaluationPreview.criteriaEvaluation?.length ||
            evaluationPreview.testCaseResults?.length) && (
            <>
              <Separator className="bg-dynamic-green/20" />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-dynamic-green" />
                  <h4 className="font-semibold text-foreground">
                    Live Results
                  </h4>
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
                          Criteria (
                          {evaluationPreview.criteriaEvaluation.length})
                        </span>
                      </div>
                      <div className="text-xs text-foreground/60">
                        Evaluation criteria being assessed in real-time
                      </div>
                    </div>
                  )}

                  {evaluationPreview.testCaseResults?.length && (
                    <div className="rounded-lg border border-dynamic-indigo/20 bg-dynamic-indigo/5 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-dynamic-indigo" />
                        <span className="text-sm font-medium text-foreground">
                          Test Cases ({evaluationPreview.testCaseResults.length}
                          )
                        </span>
                      </div>
                      <div className="text-xs text-foreground/60">
                        Test case outputs being generated
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid h-full w-full grid-cols-2 gap-1 bg-transparent shadow-sm">
            <TabsTrigger
              value="prompt"
              className="relative border bg-background text-foreground data-[state=active]:border-dynamic-blue/20 data-[state=active]:bg-dynamic-blue/10 data-[state=active]:text-dynamic-blue"
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Prompt
              {isSubmitting && (
                <div className="absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full bg-dynamic-blue shadow-lg shadow-dynamic-blue/50" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="submissions"
              className="border bg-background text-foreground data-[state=active]:border-dynamic-green/20 data-[state=active]:bg-dynamic-green/10 data-[state=active]:text-dynamic-green"
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Submissions
              {submissions && submissions.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green shadow-sm"
                >
                  {submissions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prompt" className="space-y-4">
            <div className="flex h-full flex-col">
              {renderEnhancedProgressIndicator()}

              {!isSubmitting && (
                <div className="mb-4 flex items-center justify-between rounded-lg border border-foreground/10 bg-background/60 p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-3 text-sm text-foreground/70">
                    <div className="flex items-center gap-2">
                      <div className="min-w-8 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-2 py-0.5 text-center">
                        <span className="font-mono text-xs text-dynamic-blue">
                          {prompt.length}
                        </span>
                      </div>
                      <span>/ {problem.max_prompt_length} characters</span>
                    </div>
                    <div className="h-1 w-20 overflow-hidden rounded-full border border-foreground/20 bg-background shadow-inner">
                      <div
                        className="relative h-full overflow-hidden bg-gradient-to-r from-dynamic-blue to-dynamic-purple transition-all duration-300"
                        style={{
                          width: `${Math.min((prompt.length / problem.max_prompt_length) * 100, 100)}%`,
                        }}
                      >
                        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                      </div>
                    </div>
                    {prompt.length / problem.max_prompt_length > 0.8 && (
                      <Badge
                        variant="outline"
                        className="bg-dynamic-amber/10 text-dynamic-amber border-dynamic-amber/20 text-xs"
                      >
                        {prompt.length === problem.max_prompt_length
                          ? 'Full'
                          : prompt.length > problem.max_prompt_length
                            ? 'Exceeded'
                            : 'Almost full'}
                      </Badge>
                    )}
                  </div>
                  {remainingAttempts !== null && (
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          remainingAttempts === 0 ? 'destructive' : 'outline'
                        }
                        className={cn(
                          'px-3 py-1 shadow-sm',
                          remainingAttempts === 0
                            ? 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red shadow-dynamic-red/20'
                            : remainingAttempts <= 1
                              ? 'bg-dynamic-amber/10 text-dynamic-amber border-dynamic-amber/20'
                              : 'border-foreground/20 bg-background text-foreground'
                        )}
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        {remainingAttempts}{' '}
                        {remainingAttempts === 1 ? 'attempt' : 'attempts'}{' '}
                        remaining
                      </Badge>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-1 flex-col pb-4">
                {isSubmitting && currentProgress ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="space-y-6 text-center">
                      <div className="relative">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 backdrop-blur-sm">
                          <LoadingIndicator className="h-8 w-8 text-dynamic-blue" />
                        </div>
                        <div className="absolute inset-0 animate-ping">
                          <div className="mx-auto h-16 w-16 rounded-full border border-dynamic-blue/30 bg-dynamic-blue/20" />
                        </div>
                        <div className="absolute -top-2 -right-2">
                          <Sparkles className="h-6 w-6 animate-pulse text-dynamic-purple" />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-xl font-semibold text-foreground">
                          {STEP_CONFIG[currentProgress.step]?.label ||
                            currentProgress.step}
                        </p>
                        <p className="mx-auto max-w-md leading-relaxed text-foreground/70">
                          {currentProgress.message}
                        </p>
                        <div className="flex justify-center">
                          <Badge
                            variant="outline"
                            className="border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 text-dynamic-blue"
                          >
                            {Math.round(
                              calculateOverallProgress(evaluationSteps)
                            )}
                            % complete
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative flex-1">
                      <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          remainingAttempts === 0
                            ? 'Maximum attempts reached'
                            : 'Write your prompt here...\n\nTip: Press Ctrl+Enter (or Cmd+Enter on Mac) to submit'
                        }
                        className="min-h-[200px] flex-1 resize-none border border-foreground/20 bg-background text-foreground shadow-sm transition-all duration-200 placeholder:text-foreground/40 focus-visible:ring-transparent"
                        maxLength={problem.max_prompt_length}
                        disabled={remainingAttempts === 0 || isSubmitting}
                      />
                      {prompt.length > problem.max_prompt_length && (
                        <div className="absolute right-2 bottom-2 animate-pulse rounded-md bg-dynamic-red/90 px-2 py-1 text-xs text-white shadow-lg">
                          Exceeds limit by{' '}
                          {prompt.length - problem.max_prompt_length}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-foreground/60">
                        <div className="flex items-center gap-1">
                          <span className="font-mono">Ctrl</span>
                          <Plus className="h-3 w-3" />
                          <span className="font-mono">Enter</span>
                        </div>
                        <span>to submit</span>
                      </div>
                      <Button
                        onClick={handleSend}
                        disabled={
                          !prompt.trim() ||
                          isSubmitting ||
                          remainingAttempts === 0 ||
                          prompt.length > problem.max_prompt_length
                        }
                        className="gap-2 border-0 bg-gradient-to-r from-dynamic-blue to-dynamic-purple px-6 py-2 font-medium text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:from-dynamic-blue/90 hover:to-dynamic-purple/90 hover:shadow-dynamic-blue/25 active:scale-[0.98] disabled:bg-foreground/20 disabled:text-foreground/40 disabled:shadow-none"
                      >
                        {isSubmitting ? (
                          <>
                            <LoadingIndicator className="h-4 w-4" />
                            Evaluating...
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4" />
                            Submit & Evaluate
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}

                {error && (
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4 shadow-sm">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-dynamic-red" />
                    <div>
                      <p className="text-sm font-medium text-dynamic-red">
                        Error
                      </p>
                      <p className="mt-1 text-sm text-dynamic-red/80">
                        {error}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="submissions" className="space-y-4">
            {submissions && submissions.length == 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-foreground/20 bg-background/50 p-12 text-center backdrop-blur-sm">
                <div className="relative mb-4">
                  <Clock className="mx-auto h-12 w-12 text-foreground/40" />
                  <div className="absolute inset-0 animate-pulse">
                    <Clock className="mx-auto h-12 w-12 text-foreground/20" />
                  </div>
                </div>
                <h3 className="mb-2 text-xl font-semibold text-foreground">
                  No submissions yet
                </h3>
                <p className="max-w-md text-base text-foreground/70">
                  Your submission history will appear here after you submit your
                  first prompt.
                </p>
              </div>
            ) : (
              <Tabs
                value={submissionsTab}
                onValueChange={setSubmissionsTab}
                className="w-full"
              >
                <TabsList className="grid h-full w-full grid-cols-2 gap-1 bg-transparent">
                  <TabsTrigger
                    value="current"
                    className="relative border bg-background text-foreground data-[state=active]:border-dynamic-blue/20 data-[state=active]:bg-dynamic-blue/10 data-[state=active]:text-dynamic-blue"
                  >
                    Current Session
                    {currentSubmissions.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-2 border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue"
                      >
                        {currentSubmissions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="past"
                    className="relative border bg-background text-foreground data-[state=active]:border-dynamic-purple/20 data-[state=active]:bg-dynamic-purple/10 data-[state=active]:text-dynamic-purple"
                  >
                    Past Sessions
                    {pastSubmissions.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-2 border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple"
                      >
                        {pastSubmissions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="current" className="space-y-4">
                  {currentSubmissions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-foreground/20 bg-background/50 p-8 text-center backdrop-blur-sm">
                      <div className="mb-4 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 p-3">
                        <Clock className="h-10 w-10 text-dynamic-blue" />
                      </div>
                      <h3 className="mb-2 text-lg font-medium text-foreground">
                        No submissions in current session
                      </h3>
                      <p className="text-sm text-foreground/70">
                        Submit your first prompt to see results here.
                      </p>
                    </div>
                  ) : (
                    currentSubmissions?.map((submission) => (
                      <SubmissionCard
                        key={
                          submission.id || `current-${submission.created_at}`
                        }
                        submission={getSubmissionData(submission)}
                        isCurrent={true}
                        onRequestFetch={
                          submission.id ? requestFetchSubmission : undefined
                        }
                        isLoading={
                          submission.id
                            ? loadingSubmissions.has(submission.id)
                            : false
                        }
                      />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="past" className="space-y-4">
                  {pastSubmissions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-foreground/20 bg-background/50 p-8 text-center backdrop-blur-sm">
                      <div className="mb-4 rounded-full border border-dynamic-purple/20 bg-dynamic-purple/10 p-3">
                        <Clock className="h-10 w-10 text-dynamic-purple" />
                      </div>
                      <h3 className="mb-2 text-lg font-medium text-foreground">
                        No submissions from past sessions
                      </h3>
                      <p className="text-sm text-foreground/70">
                        Past session submissions will appear here.
                      </p>
                    </div>
                  ) : (
                    pastSubmissions?.map((submission) => (
                      <SubmissionCard
                        key={submission.id || `past-${submission.created_at}`}
                        submission={getSubmissionData(submission)}
                        isCurrent={false}
                        onRequestFetch={
                          submission.id ? requestFetchSubmission : undefined
                        }
                        isLoading={
                          submission.id
                            ? loadingSubmissions.has(submission.id)
                            : false
                        }
                      />
                    ))
                  )}
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
