'use client';

import {
  NovaChallengeCriteria,
  NovaProblem,
  NovaProblemTestCase,
  NovaSession,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { CheckCircle2, Clock, PlayCircle, XCircle } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import React, { useEffect, useState } from 'react';

type HistoryEntry = {
  id: number;
  prompt: string;
  feedback: string;
  score: number;
  created_at: string;
  criteria_scores?: {
    criteria_id: string;
    score: number;
    criteria: NovaChallengeCriteria;
  }[];
};

type TestResult = {
  input: string;
  output: string;
};

interface Props {
  problem: NovaProblem & {
    test_cases: NovaProblemTestCase[];
  };
  session: NovaSession;
}

export default function PromptForm({ problem, session }: Props) {
  const [prompt, setPrompt] = useState('');
  const [customTestCase, setCustomTestCase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingCustom, setTestingCustom] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [submissions, setSubmissions] = useState<HistoryEntry[]>([]);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const getSubmissions = async () => {
      const fetchedSubmissions = await fetchSubmissions(problem.id, session.id);
      if (fetchedSubmissions) {
        setSubmissions(fetchedSubmissions);
        setAttempts(fetchedSubmissions.length);
      }
    };

    getSubmissions();
  }, [session.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

    if (attempts >= 3) {
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
      const response = await fetch(`/api/v1/problems/${problem.id}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error('Failed to process prompt');
      }

      const data = await response.json();
      const feedback = data.response.feedback || '';
      const score = data.response.score || 0;

      // Add to submissions
      const submissionResponse = await fetch(`/api/v1/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          feedback,
          score,
          problemId: problem.id,
          sessionId: session.id,
        }),
      });

      if (!submissionResponse.ok) {
        throw new Error('Failed to create submission');
      }

      const fetchedSubmissions = await fetchSubmissions(problem.id, session.id);
      if (fetchedSubmissions) {
        setSubmissions(fetchedSubmissions);
        setAttempts(fetchedSubmissions.length);
      }

      const updatedSessionResponse = await fetch(
        `/api/v1/sessions/${session.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            totalScore: session.total_score + score,
          }),
        }
      );

      if (!updatedSessionResponse.ok) {
        throw new Error('Failed to update session');
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to process submission',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestCustomCase = async () => {
    if (!customTestCase.trim()) {
      setError('Custom test case cannot be empty.');
      return;
    }

    setTestingCustom(true);
    setError('');
    setTestResult(null);

    try {
      const response = await fetch(
        `/api/v1/problems/${problem.id}/custom-testcase`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            customTestCase,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to test prompt');
      }

      const data = await response.json();
      setTestResult({
        input: data.input,
        output: data.output,
      });
    } catch (error: any) {
      console.error('Error testing prompt:', error);
      setError('Failed to test prompt with custom test case');
    } finally {
      setTestingCustom(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto pb-96">
        <Tabs defaultValue="submit" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="submit">Submit Prompt</TabsTrigger>
            <TabsTrigger value="test">Test Custom Case</TabsTrigger>
            <TabsTrigger value="history" className="relative">
              History
              {submissions.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {submissions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="submit" className="space-y-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Your Prompt</h2>
                <p className="text-sm text-muted-foreground">
                  Create a prompt that solves the problem effectively
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={attempts >= 3 ? 'destructive' : 'outline'}
                  className="px-3 py-1"
                >
                  {3 - attempts} attempts remaining
                </Badge>
                <Progress
                  value={(attempts / 3) * 100}
                  max={100}
                  className={cn(
                    'h-2 w-16',
                    attempts >= 3
                      ? 'bg-destructive/20'
                      : attempts >= 2
                        ? 'bg-amber-500/20'
                        : 'bg-emerald-500/20'
                  )}
                  indicatorClassName={
                    attempts >= 3
                      ? 'bg-destructive'
                      : attempts >= 2
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }
                />
              </div>
            </div>

            {isSubmitting && (
              <div className="flex items-center justify-center py-10">
                <LoadingIndicator />
              </div>
            )}

            {!isSubmitting && submissions.length > 0 && (
              <div className="mx-auto flex max-w-3xl flex-col items-center justify-center space-y-6 rounded-lg border border-foreground/10 bg-foreground/10 p-6 text-foreground shadow-md">
                <h3 className="text-2xl font-semibold">Your Last Attempt</h3>
                <div className="w-full rounded-lg border border-foreground/5 bg-foreground/5 p-4 shadow-md">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-foreground">
                        <strong className="font-medium">Prompt: </strong>
                        {submissions[submissions.length - 1]?.prompt}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-foreground">
                        <strong className="font-medium">Score: </strong>
                        <Badge
                          variant={
                            (submissions[submissions.length - 1]?.score || 0) >=
                            8
                              ? 'success'
                              : (submissions[submissions.length - 1]?.score ||
                                    0) >= 5
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          {submissions[submissions.length - 1]?.score || 0}/10
                        </Badge>
                      </p>
                    </div>
                    {submissions.length > 0 &&
                      submissions[submissions.length - 1]?.criteria_scores &&
                      (submissions[submissions.length - 1]?.criteria_scores
                        ?.length || 0) > 0 && (
                        <div>
                          <strong className="text-sm font-medium">
                            Criteria Scores:
                          </strong>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {submissions[
                              submissions.length - 1
                            ]?.criteria_scores?.map((cs) => {
                              if (!cs || !cs.criteria) return null;
                              return (
                                <Badge
                                  key={cs.criteria_id}
                                  variant={
                                    cs.score >= 8
                                      ? 'success'
                                      : cs.score >= 5
                                        ? 'warning'
                                        : 'destructive'
                                  }
                                >
                                  {cs.criteria.name || 'Unknown'}: {cs.score}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="test" className="space-y-4">
            <div className="space-y-4 rounded-lg border border-foreground/10 bg-foreground/10 p-6">
              <div>
                <h3 className="mb-2 text-lg font-medium">Custom Test Case</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Enter a custom test case to see how your prompt would perform
                  on it. This won't count against your submission attempts.
                </p>
                <Textarea
                  value={customTestCase}
                  onChange={(e) => setCustomTestCase(e.target.value)}
                  placeholder="Enter your custom test case here..."
                  className="min-h-[120px]"
                />
                <Button
                  onClick={handleTestCustomCase}
                  className="mt-3 gap-2"
                  disabled={
                    customTestCase.length === 0 ||
                    submissions.length === 0 ||
                    testingCustom
                  }
                >
                  <PlayCircle className="h-4 w-4" />
                  {testingCustom ? 'Testing...' : 'Test This Case'}
                </Button>
              </div>

              {testingCustom && (
                <div className="flex items-center justify-center py-6">
                  <LoadingIndicator />
                </div>
              )}

              {testResult && (
                <div className="mt-4 rounded-lg border border-foreground/10 bg-foreground/5 p-4">
                  <h4 className="mb-2 text-lg font-medium">Test Result</h4>
                  <div className="space-y-3">
                    <span className="font-semibold">Output: </span>
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {testResult.output}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="mb-4">
              <h2 className="text-xl font-bold">Submission History</h2>
              <p className="text-sm text-muted-foreground">
                Review your previous submissions and their scores
              </p>
            </div>

            {submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <Clock className="mb-2 h-10 w-10 text-muted-foreground" />
                <h3 className="text-lg font-medium">No submissions yet</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your submission history will appear here after you submit your
                  first prompt.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {submissions.map((submission, index) => (
                  <Card key={index} className="overflow-hidden">
                    <CardHeader className="bg-muted/50 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          Attempt {index + 1}
                        </CardTitle>
                        <Badge
                          variant={
                            submission.score >= 8
                              ? 'success'
                              : submission.score >= 5
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          Score: {submission.score}/10
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Submitted on{' '}
                        {new Date(submission.created_at).toLocaleString()}
                      </p>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="space-y-4">
                        <div>
                          <h4 className="mb-1 text-sm font-medium">Prompt</h4>
                          <div className="rounded-md bg-muted p-3 text-sm">
                            {submission.prompt}
                          </div>
                        </div>

                        {submission.criteria_scores &&
                          submission.criteria_scores.length > 0 && (
                            <div>
                              <h4 className="mb-2 text-sm font-medium">
                                Criteria Scores
                              </h4>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {submission.criteria_scores.map((cs) => {
                                  if (!cs || !cs.criteria) return null;
                                  return (
                                    <div
                                      key={cs.criteria_id}
                                      className={`flex items-center justify-between rounded-md border p-2 ${
                                        cs.score >= 8
                                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                                          : cs.score >= 5
                                            ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                                            : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {cs.score >= 8 ? (
                                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        ) : cs.score >= 5 ? (
                                          <Clock className="h-4 w-4 text-amber-500" />
                                        ) : (
                                          <XCircle className="h-4 w-4 text-red-500" />
                                        )}
                                        <span className="text-sm">
                                          {cs.criteria.name}
                                        </span>
                                      </div>
                                      <Badge
                                        variant={
                                          cs.score >= 8
                                            ? 'success'
                                            : cs.score >= 5
                                              ? 'warning'
                                              : 'destructive'
                                        }
                                      >
                                        {cs.score}/10
                                      </Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                        <div>
                          <h4 className="mb-1 text-sm font-medium">Feedback</h4>
                          <p className="text-sm text-muted-foreground">
                            {submission.feedback}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Fixed Chat Input */}
      <div className="absolute right-0 bottom-0 left-0 border-t shadow-md">
        <div className="flex flex-col gap-2 rounded-b-lg border bg-background p-4">
          <div className="flex gap-2">
            <Input
              placeholder={
                attempts >= 3
                  ? 'Maximum attempts reached'
                  : 'Type your prompt...'
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting || attempts >= 3}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={isSubmitting || attempts >= 3 || !prompt.trim()}
              className="whitespace-nowrap"
            >
              {isSubmitting ? 'Sending...' : 'Submit'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {prompt.length} / {problem.max_prompt_length} characters
            </span>
            <span>
              {attempts >= 3
                ? 'No attempts remaining'
                : `${3 - attempts} attempts remaining`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

async function fetchSubmissions(problemId: string, sessionId: string) {
  const response = await fetch(
    `/api/v1/submissions?problemId=${problemId}&sessionId=${sessionId}`
  );
  const data = await response.json();
  if (response.ok) {
    return data;
  } else {
    console.log('Error fetching data');
    return null;
  }
}
