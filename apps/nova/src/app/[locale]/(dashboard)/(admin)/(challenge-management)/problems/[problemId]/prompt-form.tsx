'use client';

import { ExtendedNovaSubmission, fetchSubmissions } from './actions';
import { SubmissionCard } from './submission-card';
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
import { Clock, PlayCircle } from '@tuturuuu/ui/icons';
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
                        <SubmissionCard
                          key={submission.id}
                          submission={submission}
                        />
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
