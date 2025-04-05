'use client';

import {
  NovaChallengeCriteria,
  NovaProblem,
  NovaProblemTestCase,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Clock, PlayCircle } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
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
}

export default function PromptForm({ problem }: Props) {
  const [prompt, setPrompt] = useState('');
  const [customTestCase, setCustomTestCase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [allTestResults, setAllTestResults] = useState<TestResult[]>([]);
  const [submissions, setSubmissions] = useState<HistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState('write');

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
        }),
      });

      if (!submissionResponse.ok) {
        throw new Error('Failed to create submission');
      }

      // Add to history
      const submissions = await fetchSubmissions(problem.id);
      setSubmissions(submissions);

      // Reset prompt
      setPrompt('');
      setActiveTab('history');

      toast({
        title: 'Prompt submitted successfully',
        description: 'Your prompt has been evaluated.',
      });
    } catch (error) {
      console.error('Error submitting prompt:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit prompt. Please try again.',
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

      const result = await response.json();
      setTestResult({
        input: customTestCase,
        output: result.output,
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
        if (!testcase) return null;

        const response = await fetch(
          `/api/v1/problems/${problem.id}/custom-testcase`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt,
              customTestCase: testcase,
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

      const results = (await Promise.all(testPromises)).filter(
        (result) => result !== null
      );

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
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="test">Test</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="write" className="flex-1 overflow-hidden">
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

      <TabsContent value="history" className="flex-1 overflow-auto">
        <div className="space-y-4">
          {submissions.length > 0 ? (
            submissions.map((submission) => (
              <Card key={submission.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          submission.score >= 8
                            ? 'success'
                            : submission.score >= 5
                              ? 'warning'
                              : 'destructive'
                        }
                        className="px-2 py-0"
                      >
                        {submission.score}/10
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        <Clock className="mr-1 inline h-3 w-3" />
                        {new Date(submission.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pb-3 pt-0">
                  <div>
                    <h3 className="text-muted-foreground mb-1 text-xs font-medium">
                      Prompt:
                    </h3>
                    <div className="bg-muted rounded-md p-2 text-sm">
                      {submission.prompt}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-muted-foreground mb-1 text-xs font-medium">
                      Feedback:
                    </h3>
                    <div className="bg-muted rounded-md p-2 text-sm">
                      {submission.feedback}
                    </div>
                  </div>
                  {submission.criteria_scores &&
                    submission.criteria_scores.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-muted-foreground text-xs font-medium">
                          Criteria Scores:
                        </h3>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {submission.criteria_scores.map((criteriaScore) => (
                            <div
                              key={criteriaScore.criteria_id}
                              className="flex items-center justify-between rounded-md border p-2"
                            >
                              <span className="text-xs">
                                {criteriaScore.criteria.name}
                              </span>
                              <Badge
                                variant={
                                  criteriaScore.score >= 7
                                    ? 'success'
                                    : criteriaScore.score >= 4
                                      ? 'warning'
                                      : 'destructive'
                                }
                                className="px-2 py-0"
                              >
                                {criteriaScore.score}/10
                              </Badge>
                            </div>
                          ))}
                        </div>
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

async function fetchSubmissions(problemId: string): Promise<HistoryEntry[]> {
  try {
    const response = await fetch(`/api/v1/submissions?problemId=${problemId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch submissions');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return [];
  }
}
