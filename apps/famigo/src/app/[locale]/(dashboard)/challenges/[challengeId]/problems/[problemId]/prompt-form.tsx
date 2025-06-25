'use client';

import type {
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
  NovaSubmissionData,
  NovaSubmissionWithScores,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Clock, PlayCircle } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFullSubmission } from './actions';
import { SubmissionCard } from './submission-card';

interface Props {
  problem: NovaProblem & {
    test_cases: NovaProblemTestCase[];
  };
  session: NovaSession;
  submissions: NovaSubmissionWithScores[];
}

type EnrichedSubmission = NovaSubmissionWithScores &
  Partial<NovaSubmissionData>;

const MAX_ATTEMPTS = 3;

export default function PromptForm({ problem, session, submissions }: Props) {
  const router = useRouter();

  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('prompt');
  const [submissionsTab, setSubmissionsTab] = useState('current');

  // Submission data management
  const [enrichedSubmissions, setEnrichedSubmissions] = useState<
    Record<string, EnrichedSubmission>
  >({});
  const [loadingSubmissions, setLoadingSubmissions] = useState<Set<string>>(
    new Set()
  );
  const submissionQueueRef = useRef<string[]>([]);
  const isFetchingRef = useRef(false);

  // Split submissions between current and past sessions
  const currentSubmissions = submissions?.filter(
    (s) => s.session_id === session.id
  );

  const pastSubmissions = submissions?.filter(
    (s) => s.session_id !== session.id
  );

  const remainingAttempts =
    currentSubmissions === undefined
      ? null
      : currentSubmissions.length > MAX_ATTEMPTS
        ? 0
        : MAX_ATTEMPTS - currentSubmissions.length;

  const getSubmissions = useCallback(async () => {
    router.refresh();
  }, [problem.id, session.id, router]);

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

    // Mark as loading
    setLoadingSubmissions((prev) => {
      const newSet = new Set(prev);
      newSet.add(submissionId);
      return newSet;
    });

    try {
      const data = await fetchFullSubmission(submissionId);
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
      // Remove from queue and loading state
      submissionQueueRef.current.shift();
      setLoadingSubmissions((prev) => {
        const newSet = new Set(prev);
        if (submissionId) {
          newSet.delete(submissionId);
        }
        return newSet;
      });
      isFetchingRef.current = false;

      // Process next in queue
      if (submissionQueueRef.current.length > 0) {
        processQueue();
      }
    }
  }, [submissions]);

  // Request a submission to be added to the queue
  const requestFetchSubmission = useCallback(
    (submissionId: string) => {
      // Skip if already fetched or in queue
      if (
        enrichedSubmissions[submissionId]?.criteria ||
        submissionQueueRef.current.includes(submissionId) ||
        loadingSubmissions.has(submissionId)
      )
        return;

      // Add to queue
      submissionQueueRef.current.push(submissionId);

      // Start processing if not already processing
      if (!isFetchingRef.current) {
        processQueue();
      }
    },
    [enrichedSubmissions, loadingSubmissions, processQueue]
  );

  // Initialize queue with visible submissions based on active tab
  useEffect(() => {
    if (activeTab === 'submissions') {
      const visibleSubmissions =
        submissionsTab === 'current' ? currentSubmissions : pastSubmissions;

      // Queue first 2-3 visible submissions if they have any
      if (visibleSubmissions && visibleSubmissions.length > 0) {
        // Clear queue first
        submissionQueueRef.current = [];

        // Queue first few visible submissions that aren't already enriched
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

  const handleSend = async () => {
    if (!prompt.trim()) {
      setError('Prompt cannot be empty.');
      return;
    }

    if (prompt.length > problem.max_prompt_length) {
      setError('Prompt length exceeds the maximum allowed length.');
      return;
    }

    if (remainingAttempts === null) {
      setError('The server is loading...');
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
    setPrompt('');
    setIsSubmitting(true);
    setError('');

    try {
      // Call the API endpoint which now handles evaluation, submission creation, and saving results
      const promptResponse = await fetch(
        `/api/v1/problems/${problem.id}/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            sessionId: session.id,
          }),
        }
      );

      if (!promptResponse.ok) {
        throw new Error('Failed to process prompt');
      }

      // Reset prompt and show success message
      setPrompt('');
      setActiveTab('submissions');
      setSubmissionsTab('current');

      toast({
        title: 'Prompt submitted successfully',
        description: 'Your prompt has been evaluated.',
      });
    } catch (error) {
      console.error('Error submitting prompt:', error);
      toast({
        title: 'Error',
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

  // Helper function to get enriched submission or original submission
  const getSubmissionData = (
    submission: NovaSubmissionWithScores
  ): EnrichedSubmission => {
    return submission.id
      ? enrichedSubmissions[submission.id] || submission
      : submission;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="submissions">
              Submissions
              {submissions && submissions.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {submissions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prompt" className="space-y-4">
            <div className="flex h-full flex-col">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Characters: {prompt.length} / {problem.max_prompt_length}
                </div>
                {remainingAttempts !== null && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        remainingAttempts === 0 ? 'destructive' : 'outline'
                      }
                      className="px-3 py-1"
                    >
                      {remainingAttempts} attempts remaining
                    </Badge>
                    <Progress
                      value={(prompt.length / problem.max_prompt_length) * 100}
                      className="h-1 w-24"
                      indicatorClassName={
                        remainingAttempts === 0
                          ? 'bg-destructive'
                          : remainingAttempts === 1
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col pb-4">
                {isSubmitting ? (
                  <div className="flex items-center justify-center py-10">
                    <LoadingIndicator />
                  </div>
                ) : (
                  <>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        remainingAttempts !== null
                          ? remainingAttempts === 0
                            ? 'Maximum attempts reached'
                            : 'Write your prompt here...'
                          : 'The server is loading...'
                      }
                      className="min-h-[200px] flex-1 resize-none"
                      maxLength={problem.max_prompt_length}
                      disabled={
                        remainingAttempts === null || remainingAttempts === 0
                      }
                    />

                    <div className="mt-4 flex justify-end">
                      <Button
                        onClick={handleSend}
                        disabled={
                          !prompt.trim() ||
                          isSubmitting ||
                          remainingAttempts === null ||
                          remainingAttempts === 0
                        }
                        className="gap-2"
                      >
                        {isSubmitting ? (
                          <LoadingIndicator className="h-4 w-4" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                        Submit
                      </Button>
                    </div>
                  </>
                )}

                {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="submissions" className="space-y-4">
            {submissions && submissions.length == 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <Clock className="mb-2 h-10 w-10 text-muted-foreground" />
                <h3 className="text-lg font-medium">No submissions yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your submission history will appear here after you submit your
                  first prompt.
                </p>
              </div>
            ) : (
              <>
                <Tabs
                  value={submissionsTab}
                  onValueChange={setSubmissionsTab}
                  className="w-full"
                >
                  <TabsList className="mb-4 grid w-full grid-cols-2">
                    <TabsTrigger value="current" className="relative">
                      Current Session
                      {currentSubmissions && currentSubmissions.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {currentSubmissions.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="past" className="relative">
                      Past Sessions
                      {pastSubmissions && pastSubmissions.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {pastSubmissions.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="current" className="space-y-4">
                    {currentSubmissions && currentSubmissions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                        <Clock className="mb-2 h-10 w-10 text-muted-foreground" />
                        <h3 className="text-lg font-medium">
                          No submissions in current session
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
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
                    {pastSubmissions && pastSubmissions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                        <Clock className="mb-2 h-10 w-10 text-muted-foreground" />
                        <h3 className="text-lg font-medium">
                          No submissions from past sessions
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
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
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
