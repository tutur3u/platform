'use client';

import { SubmissionCard } from '@/components/common/SubmissionCard';
import {
  LiveResultsPreview,
  LiveScoresDisplay,
} from '@/components/evaluation/LiveScoresDisplay';
import { ProgressIndicator } from '@/components/evaluation/ProgressIndicator';
import { PromptInput } from '@/components/evaluation/PromptInput';
import {
  evaluatePromptStreaming,
  type ProgressUpdate,
  STEP_CONFIG,
} from '@/lib/streaming';
import { getFullSubmission } from './actions';
import '@/styles/evaluation-animations.css';
import type {
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
  NovaSubmissionData,
  NovaSubmissionWithScores,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Clock, PlayCircle, TrendingUp } from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

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

    // Handle parsing errors gracefully
    if (progressData.step === 'parsing_error') {
      console.warn(
        'Communication issue detected, but evaluation is continuing...'
      );
      // Don't treat parsing errors as fatal - just log and continue
      return;
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
      const evaluation = progressData.data.evaluation;
      setEvaluationPreview((prev) => ({
        ...prev,
        criteriaEvaluation: evaluation.criteriaEvaluation,
        overallAssessment: evaluation.overallAssessment,
        criteriaScores: evaluation.criteriaEvaluation
          ? {
              totalScore: evaluation.criteriaEvaluation.reduce(
                (sum: number, criteria: any) => sum + (criteria.score || 0),
                0
              ),
              maxScore: evaluation.criteriaEvaluation.length * 10,
              percentage:
                evaluation.criteriaEvaluation.length > 0
                  ? Math.round(
                      (evaluation.criteriaEvaluation.reduce(
                        (sum: number, criteria: any) =>
                          sum + (criteria.score || 0),
                        0
                      ) /
                        (evaluation.criteriaEvaluation.length * 10)) *
                        100
                    )
                  : 0,
            }
          : undefined,
      }));
    }

    if (progressData.data?.partialResults) {
      const partialResults = Array.isArray(progressData.data.partialResults)
        ? progressData.data.partialResults
        : [];

      // Handle generation phase differently from evaluation phase
      if (progressData.data?.phase === 'generation') {
        setEvaluationPreview((prev) => ({
          ...prev,
          testCaseResults: partialResults,
          testCaseScores: {
            passed: 0, // Don't show pass rate during generation
            total: progressData.data?.totalCount || partialResults.length,
            percentage: 0, // Don't show percentage during generation
          },
          generationPhase: true, // Flag to indicate we're in generation phase
        }));
      } else {
        setEvaluationPreview((prev) => ({
          ...prev,
          testCaseResults: partialResults,
          testCaseScores: {
            passed: 0, // Will be calculated after test case evaluation
            total: partialResults.length,
            percentage: 0,
          },
          generationPhase: false,
        }));
      }
    }

    if (progressData.data?.testCaseResults) {
      const testCaseResults = Array.isArray(progressData.data.testCaseResults)
        ? progressData.data.testCaseResults
        : [];

      // Only show pass rates if we're in evaluation phase
      if (
        progressData.data?.phase === 'evaluation' ||
        progressData.data?.phase === 'evaluation_start'
      ) {
        setEvaluationPreview((prev) => ({
          ...prev,
          testCaseResults: testCaseResults,
          testCaseScores: {
            passed: 0, // Will be updated when backend provides match results
            total: testCaseResults.length,
            percentage: 0,
          },
          generationPhase: false,
        }));
      } else if (progressData.data?.phase === 'generation_complete') {
        setEvaluationPreview((prev) => ({
          ...prev,
          testCaseResults: testCaseResults,
          testCaseScores: {
            passed: 0,
            total: testCaseResults.length,
            percentage: 0,
          },
          generationPhase: false, // Mark generation as complete
        }));
      }
    }

    // Handle real-time test case match results from backend
    if (
      progressData.data?.matchedTestCases !== undefined &&
      progressData.data?.totalTestCases !== undefined
    ) {
      const passed = progressData.data.matchedTestCases;
      const total = progressData.data.totalTestCases;

      console.log('Test case results update:', {
        passed,
        total,
        isPartial: progressData.data.isPartialResults,
      });

      setEvaluationPreview((prev) => ({
        ...prev,
        testCaseResults:
          progressData.data.testCaseResults || prev.testCaseResults,
        testCaseScores: {
          passed,
          total,
          percentage: total > 0 ? Math.round((passed / total) * 100) : 0,
        },
      }));
    }

    // Handle submission ID
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

          // Check if this is a recoverable parsing error
          if (
            error.message.includes('JSON parse error') ||
            error.message.includes('parse error')
          ) {
            // For parsing errors, show a warning but don't fail completely
            toast({
              title: '⚠️ Communication Issue',
              description:
                'Some data transmission issues occurred, but evaluation is continuing. Please wait for completion.',
              variant: 'default',
            });

            // Set a temporary progress update to show the issue
            setCurrentProgress({
              step: 'parsing_error',
              progress: 0,
              message: 'Recovering from communication issue...',
              data: { recoverable: true },
            });

            return; // Don't end the submission process for recoverable errors
          }

          // For other errors, show the full error
          toast({
            title: '❌ Evaluation Error',
            description: error.message,
            variant: 'destructive',
          });

          // Set error state and end submission
          setIsSubmitting(false);
          setError(error.message);
        }
      );
    } catch (error) {
      console.error('Error submitting prompt:', error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to submit prompt. Please try again.';

      // Check if this is a network or parsing related error
      if (
        errorMessage.includes('fetch') ||
        errorMessage.includes('network') ||
        errorMessage.includes('parse')
      ) {
        toast({
          title: '🌐 Connection Issue',
          description:
            'There was a network or communication problem. Please check your connection and try again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: '❌ Submission Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }

      setError(errorMessage);
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex h-full w-full flex-col"
        >
          <TabsList className="grid h-12 w-full grid-cols-2 gap-2 border border-foreground/10 bg-gradient-to-r from-background/80 via-background/95 to-background/80 shadow-lg backdrop-blur-sm">
            <TabsTrigger
              value="prompt"
              className={cn(
                'relative border-2 bg-background font-medium text-foreground transition-all duration-300',
                'data-[state=active]:border-dynamic-blue/30 data-[state=active]:bg-gradient-to-r data-[state=active]:from-dynamic-blue/10 data-[state=active]:to-dynamic-blue/15 data-[state=active]:text-dynamic-blue',
                'hover:border-foreground/30 hover:bg-background/80',
                'focus-visible:ring-2 focus-visible:ring-dynamic-blue/50 focus-visible:ring-offset-2'
              )}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Prompt
              {isSubmitting && (
                <div className="-top-1 -right-1 absolute h-3 w-3 animate-pulse rounded-full bg-dynamic-blue shadow-dynamic-blue/50 shadow-lg" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="submissions"
              className={cn(
                'relative border-2 bg-background font-medium text-foreground transition-all duration-300',
                'data-[state=active]:border-dynamic-green/30 data-[state=active]:bg-gradient-to-r data-[state=active]:from-dynamic-green/10 data-[state=active]:to-dynamic-green/15 data-[state=active]:text-dynamic-green',
                'hover:border-foreground/30 hover:bg-background/80',
                'focus-visible:ring-2 focus-visible:ring-dynamic-green/50 focus-visible:ring-offset-2'
              )}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Submissions
              {submissions && submissions.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 border-dynamic-green/20 bg-dynamic-green/10 font-medium text-dynamic-green shadow-sm"
                >
                  {submissions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="prompt"
            className="mt-6 flex flex-1 flex-col space-y-6"
          >
            {/* Progress Indicator */}
            <ProgressIndicator
              isSubmitting={isSubmitting}
              currentProgress={currentProgress}
              isEvaluationComplete={isEvaluationComplete}
              evaluationSteps={evaluationSteps}
              evaluationPreview={evaluationPreview}
              expandedCategories={expandedCategories}
              onToggleCategory={toggleCategory}
            />

            <PromptInput
              prompt={prompt}
              onPromptChange={setPrompt}
              onSubmit={handleSend}
              isSubmitting={isSubmitting}
              error={error}
              maxLength={problem.max_prompt_length}
              remainingAttempts={remainingAttempts}
              currentProgress={currentProgress}
            />

            {/* Real-time Scores Display */}
            <LiveScoresDisplay evaluationPreview={evaluationPreview} />

            {/* Live Results Preview */}
            <LiveResultsPreview evaluationPreview={evaluationPreview} />
          </TabsContent>

          <TabsContent value="submissions" className="space-y-4">
            {submissions && submissions.length == 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-foreground/20 border-dashed bg-background/50 p-12 text-center backdrop-blur-sm">
                <div className="relative mb-4">
                  <Clock className="mx-auto h-12 w-12 text-foreground/40" />
                  <div className="absolute inset-0 animate-pulse">
                    <Clock className="mx-auto h-12 w-12 text-foreground/20" />
                  </div>
                </div>
                <h3 className="mb-2 font-semibold text-foreground text-xl">
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
                    <div className="flex flex-col items-center justify-center rounded-lg border border-foreground/20 border-dashed bg-background/50 p-8 text-center backdrop-blur-sm">
                      <div className="mb-4 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 p-3">
                        <Clock className="h-10 w-10 text-dynamic-blue" />
                      </div>
                      <h3 className="mb-2 font-medium text-foreground text-lg">
                        No submissions in current session
                      </h3>
                      <p className="text-foreground/70 text-sm">
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
                    <div className="flex flex-col items-center justify-center rounded-lg border border-foreground/20 border-dashed bg-background/50 p-8 text-center backdrop-blur-sm">
                      <div className="mb-4 rounded-full border border-dynamic-purple/20 bg-dynamic-purple/10 p-3">
                        <Clock className="h-10 w-10 text-dynamic-purple" />
                      </div>
                      <h3 className="mb-2 font-medium text-foreground text-lg">
                        No submissions from past sessions
                      </h3>
                      <p className="text-foreground/70 text-sm">
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
