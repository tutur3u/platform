'use client';

import { ExtendedNovaSubmission, fetchSubmissions } from './actions';
import ScoreBadge from '@/components/common/ScoreBadge';
import { NovaProblem, NovaProblemTestCase } from '@tuturuuu/types/db';
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
import { Clock, PlayCircle } from '@tuturuuu/ui/icons';
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

  useEffect(() => {
    // Load submission history when component mounts
    const getSubmissions = async () => {
      try {
        const submissions = await fetchSubmissions(problem.id);
        setSubmissions(submissions);
      } catch (error) {
        console.error('Failed to fetch submissions:', error);
      }
    };

    getSubmissions();
  }, [problem.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);

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
          sessionId: null,
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
      const submissions = await fetchSubmissions(problem.id);
      setSubmissions(submissions);

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
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex h-full flex-col"
    >
      <TabsList className="mb-4 grid w-full grid-cols-3">
        <TabsTrigger value="prompt">Prompt</TabsTrigger>
        <TabsTrigger value="test">Test</TabsTrigger>
        <TabsTrigger value="submissions">Submissions</TabsTrigger>
      </TabsList>

      <TabsContent value="prompt" className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-muted-foreground text-sm">
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

      <TabsContent value="test" className="flex-1 overflow-auto">
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
                  <div className="bg-muted rounded-md p-3 font-mono text-sm">
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
                    <div className="bg-muted rounded-md p-3 font-mono text-sm">
                      {result.input}
                    </div>
                    <h3 className="text-sm font-medium">Output:</h3>
                    <div className="bg-muted rounded-md p-3 font-mono text-sm">
                      {result.output}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="submissions" className="flex-1 overflow-auto">
        <div className="space-y-4">
          {submissions.length > 0 ? (
            submissions.map((submission) => (
              <Card key={submission.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ScoreBadge
                        score={submission.total_score}
                        maxScore={10}
                        className="px-2 py-0"
                      >
                        {submission.total_score.toFixed(2)}/10
                      </ScoreBadge>
                      <span className="text-muted-foreground text-xs">
                        <Clock className="mr-1 inline h-3 w-3" />
                        {new Date(submission.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pb-3 pt-0">
                  <div>
                    <h3 className="text-foreground text-md mb-1 font-medium">
                      Prompt:
                    </h3>
                    <div className="bg-muted rounded-md p-2 text-sm">
                      {submission.prompt}
                    </div>
                  </div>

                  {submission.criteria.length > 0 ? (
                    <>
                      <h3 className="text-foreground text-md font-medium">
                        Evaluation Results:
                      </h3>

                      <div className="mt-4 space-y-2">
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
                        <div className="flex items-center justify-between rounded-md border p-2">
                          <span className="text-xs">Test Cases Passed</span>
                          <ScoreBadge
                            score={submission.passed_tests}
                            maxScore={submission.total_tests}
                            className="px-2 py-0"
                          >
                            {submission.passed_tests}/{submission.total_tests}
                          </ScoreBadge>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
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
                        <div className="flex flex-col gap-2">
                          {submission.criteria.map((criterion) => (
                            <div
                              key={criterion.result.criteria_id}
                              className="space-y-2 rounded-md border px-2 py-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm">
                                  {criterion.name}
                                </span>
                                <ScoreBadge
                                  score={criterion.result.score}
                                  maxScore={10}
                                  className="px-2 py-0"
                                >
                                  {criterion.result.score.toFixed(2)}/10
                                </ScoreBadge>
                              </div>
                              <div className="bg-muted whitespace-pre-line rounded-md p-2 text-sm">
                                <div
                                  key={criterion.result.criteria_id}
                                  className="mb-2"
                                >
                                  <strong>Feedback: </strong>
                                  {criterion.result.feedback}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <p className="text-muted-foreground text-sm">
                        No evaluation results yet
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed">
              <p className="text-muted-foreground text-sm">
                No submission history yet
              </p>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
