'use client';

import { SubmissionCard } from './submission-card';
import {
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
  type NovaSubmissionWithScores,
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
import React, { useState } from 'react';

interface Props {
  problem: NovaProblem & {
    test_cases: NovaProblemTestCase[];
  };
  session: NovaSession;
  submissions: NovaSubmissionWithScores[];
}

const MAX_ATTEMPTS = 3;

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
      : currentSubmissions.length > MAX_ATTEMPTS
        ? 0
        : MAX_ATTEMPTS - currentSubmissions.length;

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
      router.refresh();
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
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
                <div className="text-muted-foreground text-sm">
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
                <Clock className="text-muted-foreground mb-2 h-10 w-10" />
                <h3 className="text-lg font-medium">No submissions yet</h3>
                <p className="text-muted-foreground mt-1 text-sm">
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
                        <Clock className="text-muted-foreground mb-2 h-10 w-10" />
                        <h3 className="text-lg font-medium">
                          No submissions in current session
                        </h3>
                        <p className="text-muted-foreground mt-1 text-sm">
                          Submit your first prompt to see results here.
                        </p>
                      </div>
                    ) : (
                      currentSubmissions?.map((submission) => (
                        <SubmissionCard
                          key={submission.id}
                          submission={submission}
                          isCurrent={true}
                          problemId={problem.id}
                        />
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="past" className="space-y-4">
                    {pastSubmissions && pastSubmissions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                        <Clock className="text-muted-foreground mb-2 h-10 w-10" />
                        <h3 className="text-lg font-medium">
                          No submissions from past sessions
                        </h3>
                        <p className="text-muted-foreground mt-1 text-sm">
                          Past session submissions will appear here.
                        </p>
                      </div>
                    ) : (
                      pastSubmissions?.map((submission) => (
                        <SubmissionCard
                          key={submission.id}
                          submission={submission}
                          isCurrent={false}
                          problemId={problem.id}
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
