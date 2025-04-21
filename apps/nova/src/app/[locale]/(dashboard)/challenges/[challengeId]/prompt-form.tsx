'use client';

import { ExtendedNovaSubmission, fetchSubmissions } from './actions';
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
import { CheckCircle2, Clock, PlayCircle, XCircle } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import React, { useEffect, useState } from 'react';

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
  const [submissions, setSubmissions] = useState<ExtendedNovaSubmission[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [activeTab, setActiveTab] = useState('prompt');

  useEffect(() => {
    const getSubmissions = async () => {
      const fetchedSubmissions = await fetchSubmissions(problem.id, session.id);
      if (fetchedSubmissions) {
        setSubmissions(fetchedSubmissions);
        setAttempts(fetchedSubmissions.length);
      }
    };

    getSubmissions();
  }, [problem.id, session.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      // Step 1: Get evaluation results from the problem API
      const promptResponse = await fetch(
        `/api/v1/problems/${problem.id}/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        }
      );

      if (!promptResponse.ok) {
        throw new Error('Failed to process prompt');
      }

      const promptData = await promptResponse.json();
      const testCaseEvaluation = promptData.response.testCaseEvaluation || [];
      const criteriaEvaluation = promptData.response.criteriaEvaluation || [];

      // Step 2: Create the submission record
      const submissionResponse = await fetch(`/api/v1/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          problemId: problem.id,
          sessionId: session.id,
        }),
      });

      if (!submissionResponse.ok) {
        const errorData = await submissionResponse.json();
        throw new Error(
          errorData.message || 'Failed to submit prompt. Please try again.'
        );
      }

      // Get the newly created submission ID
      const submissionData = await submissionResponse.json();
      const submissionId = submissionData.id;

      // Step 3: Save test case results
      await Promise.allSettled(
        testCaseEvaluation.map(async (testCase: any) => {
          // Find matching test case in the problem
          const matchingTestCase = problem.test_cases.find(
            (tc) => tc.input === testCase.input
          );

          if (matchingTestCase) {
            await fetch(`/api/v1/submissions/${submissionId}/test-cases`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                testCaseId: matchingTestCase.id,
                output: testCase.output,
                matched: matchingTestCase.output === testCase.output,
              }),
            });
          }
        })
      );

      // Step 4: Save criteria evaluations
      // First, fetch the challenge criteria to get IDs
      const criteriaResponse = await fetch(
        `/api/v1/criteria?challengeId=${problem.challenge_id}`
      );
      if (criteriaResponse.ok) {
        const challengeCriteria = await criteriaResponse.json();

        // Then save each criteria evaluation with proper ID mapping
        await Promise.allSettled(
          criteriaEvaluation.map(async (criteriaEval: any) => {
            // Find matching criteria by name
            const matchingCriteria = challengeCriteria.find(
              (c: any) => c.name === criteriaEval.name
            );

            if (matchingCriteria) {
              await fetch(`/api/v1/submissions/${submissionId}/criteria`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  criteriaId: matchingCriteria.id,
                  score: criteriaEval.score,
                  feedback: criteriaEval.feedback,
                }),
              });
            }
          })
        );
      }

      // Step 5: Refresh the submissions list
      const submissions = await fetchSubmissions(problem.id, session.id);
      setSubmissions(submissions);
      setAttempts(submissions.length);

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
    } catch (error: any) {
      console.error('Error testing prompt:', error);
      setError('Failed to test prompt with custom test case');
    } finally {
      setTestingCustom(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-3">
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="test">Test</TabsTrigger>
            <TabsTrigger value="submissions" className="relative">
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
                <div className="text-muted-foreground text-sm">
                  Characters: {prompt.length} / {problem.max_prompt_length}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={attempts >= 3 ? 'destructive' : 'outline'}
                    className="px-3 py-1"
                  >
                    {3 - attempts} attempts remaining
                  </Badge>
                  <Progress
                    value={(prompt.length / problem.max_prompt_length) * 100}
                    className="h-1 w-24"
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
                        attempts >= 3
                          ? 'Maximum attempts reached'
                          : 'Write your prompt here...'
                      }
                      className="min-h-[200px] flex-1 resize-none"
                      maxLength={problem.max_prompt_length}
                      disabled={attempts >= 3}
                    />

                    <div className="mt-4 flex justify-end">
                      <Button
                        onClick={handleSend}
                        disabled={
                          !prompt.trim() || isSubmitting || attempts >= 3
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

          <TabsContent value="test" className="space-y-4">
            <div className="border-foreground/10 bg-foreground/10 space-y-4 rounded-lg border p-6">
              <div>
                <h3 className="mb-2 text-lg font-medium">Custom Test Case</h3>
                <p className="text-muted-foreground mb-3 text-sm">
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
                <div className="border-foreground/10 bg-foreground/5 mt-4 rounded-lg border p-4">
                  <h4 className="mb-2 text-lg font-medium">Test Result</h4>
                  <div className="space-y-3">
                    <span className="font-semibold">Output: </span>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {testResult.output}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="submissions" className="space-y-4">
            {submissions.length == 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <Clock className="text-muted-foreground mb-2 h-10 w-10" />
                <h3 className="text-lg font-medium">No submissions yet</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Your submission history will appear here after you submit your
                  first prompt.
                </p>
              </div>
            ) : (
              submissions.map((submission) => (
                <Card key={submission.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">
                        <Clock className="mr-1 inline h-3 w-3" />
                        {new Date(submission.created_at).toLocaleString()}
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
                      <h3 className="text-foreground mb-1 text-sm font-medium">
                        Prompt:
                      </h3>
                      <div className="bg-muted rounded-md p-2 text-sm">
                        {submission.prompt}
                      </div>
                    </div>

                    {/* Test Case Evaluation */}
                    {submission.total_tests > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-muted-foreground text-xs font-medium">
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
                          <h3 className="text-muted-foreground text-xs font-medium">
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
                                    <ScoreBadge
                                      score={cs.result.score}
                                      maxScore={10}
                                    >
                                      {cs.result.score}/10
                                    </ScoreBadge>
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-80 p-4">
                                  <div className="space-y-2">
                                    <h4 className="font-medium">Feedback</h4>
                                    <p className="text-muted-foreground text-sm">
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
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
