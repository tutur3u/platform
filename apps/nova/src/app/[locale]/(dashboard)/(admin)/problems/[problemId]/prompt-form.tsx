'use client';

import { ExtendedNovaSubmission, fetchSubmissions } from './actions';
import ScoreBadge from '@/components/common/ScoreBadge';
import { NovaProblem, NovaProblemTestCase } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { CheckCircle2, Clock, PlayCircle, XCircle } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import React, { useCallback, useEffect, useState } from 'react';

type TestResult = {
  input: string;
  output: string;
};

interface Props {
  problem: NovaProblem & {
    test_cases: NovaProblemTestCase[];
  };
}

export default function PromptForm({ problem }: Props) {
  const [prompt, setPrompt] = useState('');
  const [customTestCase, setCustomTestCase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [allTestResults, setAllTestResults] = useState<TestResult[]>([]);
  const [submissions, setSubmissions] = useState<ExtendedNovaSubmission[]>([]);
  const [activeTab, setActiveTab] = useState('prompt');

  const getSubmissions = useCallback(async () => {
    const submissions = await fetchSubmissions(problem.id);
    setSubmissions(submissions);
  }, [problem.id]);

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
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Call the API endpoint which now handles evaluation, submission creation, and saving results
      const promptResponse = await fetch(
        `/api/v1/problems/${problem.id}/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            sessionId: null,
          }),
        }
      );

      if (!promptResponse.ok) {
        throw new Error('Failed to process prompt');
      }

      // Reset prompt and show success message
      setPrompt('');
      setActiveTab('submissions');

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

  const handleTestCustomCase = async () => {
    if (!prompt.trim() || !customTestCase.trim() || isTesting) return;

    setIsTesting(true);

    try {
      const response = await fetch(
        `/api/v1/problems/${problem.id}/custom-testcase`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            input: customTestCase,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to test prompt');
      }

      const data = await response.json();

      setTestResult({
        input: data.response.input,
        output: data.response.output,
      });
    } catch (error) {
      console.error('Error testing prompt:', error);
      toast({
        title: 'Error',
        description: 'Failed to test prompt. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestAllCases = async () => {
    if (!prompt.trim() || isTesting) return;

    setIsTesting(true);

    try {
      const testPromises = problem.test_cases.map(async (testcase, index) => {
        const response = await fetch(
          `/api/v1/problems/${problem.id}/custom-testcase`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt,
              input: testcase.input,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to test case ${index + 1}`);
        }

        const data = await response.json();

        return {
          input: data.response.input,
          output: data.response.output,
        };
      });

      const settledResults = await Promise.allSettled(testPromises);
      const results = settledResults
        .filter(
          (result): result is PromiseFulfilledResult<TestResult> =>
            result.status === 'fulfilled'
        )
        .map((result) => result.value);

      setAllTestResults(results);

      toast({
        title: 'Test completed',
        description: 'All test cases have been processed.',
      });
    } catch (error) {
      console.error('Error testing all cases:', error);
      toast({
        title: 'Error',
        description: 'Failed to test all cases. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-4 grid w-full grid-cols-3">
        <TabsTrigger value="prompt">Prompt</TabsTrigger>
        <TabsTrigger value="test">Test</TabsTrigger>
        <TabsTrigger value="submissions">
          Submissions
          {submissions.length > 0 && (
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
            <Progress
              value={(prompt.length / problem.max_prompt_length) * 100}
              className="h-1 w-24"
            />
          </div>

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write your prompt here..."
            className="flex-1 resize-none"
            maxLength={problem.max_prompt_length}
          />

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleSend}
              disabled={!prompt.trim() || isSubmitting}
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
        </div>
      </TabsContent>

      <TabsContent value="test" className="space-y-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Custom Test Case</CardTitle>
              <CardDescription>
                Enter a custom test case to see how your prompt would perform on
                it. This won't count against your submission attempts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={customTestCase}
                onChange={(e) => setCustomTestCase(e.target.value)}
                placeholder="Enter your test case input here..."
                className="h-24 resize-none"
              />

              <div className="flex justify-end">
                <Button
                  onClick={handleTestCustomCase}
                  disabled={
                    !prompt.trim() || !customTestCase.trim() || isTesting
                  }
                  className="gap-2"
                >
                  {isTesting ? (
                    <LoadingIndicator className="h-4 w-4" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  Test
                </Button>
              </div>

              {testResult && (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-medium">Output:</h3>
                  <div className="rounded-md bg-muted p-3 font-mono text-sm">
                    {testResult.output}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test All Cases</CardTitle>
              <CardDescription>
                Test your prompt against all test cases. This won't count
                against your submission attempts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    onClick={handleTestAllCases}
                    disabled={!prompt.trim() || isTesting}
                    className="gap-2"
                  >
                    {isTesting ? (
                      <LoadingIndicator className="h-4 w-4" />
                    ) : (
                      <PlayCircle className="h-4 w-4" />
                    )}
                    Test All Cases
                  </Button>
                </div>

                {allTestResults.map((result, index) => (
                  <div key={index} className="space-y-2">
                    <h3 className="text-sm font-medium">
                      Test Case {index + 1}:
                    </h3>
                    <div className="rounded-md bg-muted p-3 font-mono text-sm">
                      {result.input}
                    </div>
                    <h3 className="text-sm font-medium">Output:</h3>
                    <div className="rounded-md bg-muted p-3 font-mono text-sm">
                      {result.output}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="submissions" className="space-y-4">
        {submissions.length == 0 ? (
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
            {/* Group by session_id or show independently */}
            {(() => {
              // Group submissions by session_id (null ones are grouped separately)
              const groupedBySession = submissions.reduce(
                (acc, submission) => {
                  const key = submission.session_id || 'standalone';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(submission);
                  return acc;
                },
                {} as Record<string, ExtendedNovaSubmission[]>
              );

              return Object.entries(groupedBySession).map(
                ([sessionKey, groupedSubmissions]) => (
                  <div key={sessionKey} className="mb-6">
                    {sessionKey !== 'standalone' && (
                      <div className="mb-2 flex items-center">
                        <Badge variant="outline" className="mb-2">
                          Session ID: {sessionKey}
                        </Badge>
                      </div>
                    )}

                    <div className="space-y-4">
                      {groupedSubmissions.map((submission) => (
                        <Card key={submission.id} className="overflow-hidden">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                <Clock className="mr-1 inline h-3 w-3" />
                                {new Date(
                                  submission.created_at
                                ).toLocaleString()}
                              </span>

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
                              <h3 className="mb-1 text-sm font-medium text-foreground">
                                Prompt:
                              </h3>
                              <div className="rounded-md bg-muted p-2 text-sm">
                                {submission.prompt}
                              </div>
                            </div>

                            {/* Overall Assessment - moved to top for better visibility */}
                            {submission.overall_assessment && (
                              <div className="space-y-2">
                                <h3 className="mb-1 text-sm font-medium text-foreground">
                                  Overall Assessment:
                                </h3>
                                <div className="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                                  <p className="text-sm">
                                    {submission.overall_assessment}
                                  </p>
                                </div>
                              </div>
                            )}

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
                                      Passed {submission.passed_tests} of{' '}
                                      {submission.total_tests} test cases
                                    </span>
                                  </div>
                                  <Progress
                                    value={
                                      (submission.passed_tests /
                                        submission.total_tests) *
                                      100
                                    }
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
                                    Criteria Evaluation:
                                  </h3>
                                  <ScoreBadge
                                    score={submission.criteria_score}
                                    maxScore={10}
                                    className="px-2 py-0"
                                  >
                                    {submission.criteria_score.toFixed(2)}/10
                                  </ScoreBadge>
                                </div>
                                <div className="grid gap-4">
                                  {submission.criteria.map((cs) => {
                                    if (!cs || !cs.result) return null;

                                    return (
                                      <div
                                        key={cs.id}
                                        className={`rounded-md border p-3 ${
                                          cs.result.score >= 8
                                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                                            : cs.result.score >= 5
                                              ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                                              : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                                        }`}
                                      >
                                        <div className="mb-2 flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            {cs.result.score >= 8 ? (
                                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            ) : cs.result.score >= 5 ? (
                                              <Clock className="h-4 w-4 text-amber-500" />
                                            ) : (
                                              <XCircle className="h-4 w-4 text-red-500" />
                                            )}
                                            <span className="text-sm font-medium">
                                              {cs.name}
                                            </span>
                                          </div>
                                          <ScoreBadge
                                            score={cs.result.score}
                                            maxScore={10}
                                          >
                                            {cs.result.score}/10
                                          </ScoreBadge>
                                        </div>

                                        <div className="mt-1 rounded border bg-background/50 p-2">
                                          <p className="text-sm text-muted-foreground">
                                            {cs.result.feedback}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )
              );
            })()}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
