'use client';

import { NovaChallengeCriteria } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Progress } from '@tuturuuu/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Clock, PlayCircle } from 'lucide-react';
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
  output: string;
};

interface Problem {
  id: string;
  title: string;
  description: string;
  maxPromptLength: number;
  exampleInput: string;
  exampleOutput: string;
  testcases: string[];
}

export default function PromptForm({ problem }: { problem: Problem }) {
  const [prompt, setPrompt] = useState('');
  const [customTestCase, setCustomTestCase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {}
  );
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState('write');

  useEffect(() => {
    // Load submission history when component mounts
    const getSubmissions = async () => {
      try {
        const submissions = await fetchSubmissions(problem.id);
        setHistory(submissions);
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
      const response = await fetch('/api/v1/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          problemId: problem.id,
          prompt,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit prompt');
      }

      // Add to history
      const submissions = await fetchSubmissions(problem.id);
      setHistory(submissions);

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
      const response = await fetch('/api/v1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          input: customTestCase,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to test prompt');
      }

      const result = await response.json();
      setTestResults((prev) => ({
        ...prev,
        custom: { output: result.output },
      }));
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
    const newResults: Record<string, TestResult> = {};

    try {
      for (let i = 0; i < problem.testcases.length; i++) {
        const testcase = problem.testcases[i];

        const response = await fetch('/api/v1/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            input: testcase,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to test case ${i + 1}`);
        }

        const result = await response.json();
        newResults[`test-${i}`] = { output: result.output };
      }

      setTestResults(newResults);
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
    <div className="flex h-full flex-col">
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
              <div className="text-sm text-muted-foreground">
                Characters: {prompt.length} / {problem.maxPromptLength}
              </div>
              <Progress
                value={(prompt.length / problem.maxPromptLength) * 100}
                className="h-1 w-24"
              />
            </div>

            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write your prompt here..."
              className="flex-1 resize-none"
              maxLength={problem.maxPromptLength}
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

                {testResults.custom && (
                  <div className="mt-4">
                    <h3 className="mb-2 text-sm font-medium">Output:</h3>
                    <div className="rounded-md bg-muted p-3 font-mono text-sm">
                      {testResults.custom.output}
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

                  {Object.keys(testResults)
                    .filter((key) => key !== 'custom')
                    .map((key) => {
                      // Safely extract the test number
                      const parts = key.split('-');
                      const testIndex =
                        parts.length > 1 && !isNaN(Number(parts[1]))
                          ? Number(parts[1])
                          : 0;
                      const testNumber = testIndex + 1;

                      // Safely get the test case
                      const testCase = problem.testcases[testIndex] || '';

                      // Safely get the output
                      const output = testResults[key]?.output || '';

                      return (
                        <div key={key} className="space-y-2">
                          <h3 className="text-sm font-medium">
                            Test Case {testNumber}:
                          </h3>
                          <div className="rounded-md bg-muted p-3 font-mono text-sm">
                            {testCase}
                          </div>
                          <h3 className="text-sm font-medium">Output:</h3>
                          <div className="rounded-md bg-muted p-3 font-mono text-sm">
                            {output}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 overflow-auto">
          <div className="space-y-4">
            {history.length > 0 ? (
              history.map((entry) => (
                <Card key={entry.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            entry.score >= 70 ? 'success' : 'destructive'
                          }
                          className="px-2 py-0"
                        >
                          {entry.score}%
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          <Clock className="mr-1 inline h-3 w-3" />
                          {new Date(entry.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 pb-3">
                    <div>
                      <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                        Prompt:
                      </h3>
                      <div className="rounded-md bg-muted p-2 text-sm">
                        {entry.prompt}
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                        Feedback:
                      </h3>
                      <div className="rounded-md bg-muted p-2 text-sm">
                        {entry.feedback}
                      </div>
                    </div>
                    {entry.criteria_scores &&
                      entry.criteria_scores.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-xs font-medium text-muted-foreground">
                            Criteria Scores:
                          </h3>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {entry.criteria_scores.map((criteriaScore) => (
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
                <p className="text-sm text-muted-foreground">
                  No submission history yet
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
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
