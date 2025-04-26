'use client';

import { ExtendedNovaSubmission } from './actions';
import ScoreBadge from '@/components/common/ScoreBadge';
import {
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@tuturuuu/ui/hover-card';
import {
  CheckCircle2,
  Clock,
  PlayCircle,
  User,
  XCircle,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

interface Props {
  problem: NovaProblem & {
    test_cases: NovaProblemTestCase[];
  };
  session: NovaSession;
  submissions: ExtendedNovaSubmission[];
}

export default function PromptForm({ problem, session, submissions }: Props) {
  const router = useRouter();

  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('prompt');
  const [submissionsTab, setSubmissionsTab] = useState('current');

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
      : currentSubmissions.length > 3
        ? 0
        : 3 - currentSubmissions.length;

  const getSubmissions = useCallback(async () => {
    router.refresh();
  }, [problem.id, session.id]);

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
      setError('You have reached the maximum number of attempts (3).');
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
                          key={submission.id}
                          submission={submission}
                          isCurrent={true}
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
                          key={submission.id}
                          submission={submission}
                          isCurrent={false}
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

interface SubmissionCardProps {
  submission: ExtendedNovaSubmission;
  isCurrent: boolean;
}

function SubmissionCard({ submission, isCurrent }: SubmissionCardProps) {
  return (
    <Card
      key={submission.id}
      className={`overflow-hidden ${isCurrent ? '' : 'border-muted-foreground/20'}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              <Clock className="mr-1 inline h-3 w-3" />
              {new Date(submission.created_at).toLocaleString()}
            </span>

            {!isCurrent && (
              <Badge variant="outline" className="text-xs">
                <User className="mr-1 h-3 w-3" />
                Past Session
              </Badge>
            )}
          </div>

          <ScoreBadge
            score={submission.total_score}
            maxScore={10}
            className="px-2 py-0"
          >
            {submission.total_score.toFixed(2)}/10
          </ScoreBadge>
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
        {submission.total_tests > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">
                Test Case Evaluation:
              </h3>
              <ScoreBadge
                score={submission.test_case_score}
                maxScore={10}
                className="px-2 py-0"
              >
                {submission.test_case_score.toFixed(2)}/10
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
                value={(submission.passed_tests / submission.total_tests) * 100}
                className="h-2 w-full"
                indicatorClassName={
                  submission.test_case_score >= 8
                    ? 'bg-emerald-500'
                    : submission.test_case_score >= 5
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }
              />
            </div>
          </div>
        )}

        {/* Criteria Evaluation */}
        {submission.total_criteria > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">
                Criteria Evaluation
                {isCurrent ? '' : ': (Hover to see Feedback)'}
              </h3>
              <ScoreBadge
                score={submission.criteria_score}
                maxScore={10}
                className="px-2 py-0"
              >
                {submission.criteria_score.toFixed(2)}/10
              </ScoreBadge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {submission.criteria.map((cs) => {
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
                        <p className="text-sm text-muted-foreground">
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
