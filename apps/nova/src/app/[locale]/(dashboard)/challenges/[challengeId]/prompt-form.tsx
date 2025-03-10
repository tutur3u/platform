'use client';

import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { History, PlayCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';

type HistoryEntry = {
  score: number;
  input: string;
  output: string;
};

type TestResult = {
  score: number;
  feedback: string;
  suggestions: string;
};

interface Problem {
  id: string;
  title: string;
  description: string;
  maxInputLength: number;
  exampleInput: string;
  exampleOutput: string;
  testcases: string[];
}

export default function PromptForm({ problem }: { problem: Problem }) {
  const [_messages, setMessages] = useState<
    { text: string; sender: 'user' | 'ai' }[]
  >([]);
  const [input, setInput] = useState('');
  const [customTestCase, setCustomTestCase] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingCustom, setTestingCustom] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [submissions, setSubmissions] = useState<HistoryEntry[]>([]);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const fetchSubmissions = async () => {
      if (problem?.id) {
        const fetchedSubmissions = await fetchSubmissionsFromAPI(problem.id);
        if (fetchedSubmissions) {
          setSubmissions(fetchedSubmissions);
          setAttempts(fetchedSubmissions.length);
        }
      }
    };

    fetchSubmissions();
  }, [problem?.id]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    if (!input.trim()) {
      setError('Input cannot be empty.');
      return;
    }

    if (input.length > problem.maxInputLength) {
      setError('Input length exceeds the maximum allowed length.');
      return;
    }

    if (attempts >= 3) {
      setError('You have reached the maximum number of attempts (3).');
      return;
    }

    if (loading) {
      setError('Please wait for the previous attempt to complete.');
      return;
    }

    const newUserMessage = { text: input, sender: 'user' as const };
    setMessages((prev) => [...prev, newUserMessage]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/ai/chat/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: input,
          problemDescription: problem.description,
          testCases: problem.testcases,
          exampleInput: problem.exampleInput,
          exampleOutput: problem.exampleOutput,
        }),
      });

      const data = await response.json();
      const output = data.response.feedback || '';
      const score = data.response.score || 0;

      // Add to submissions
      const submissionResponse = await fetch(
        `/api/v1/problems/${problem.id}/submissions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input,
            output,
            score,
          }),
        }
      );

      if (!submissionResponse.ok) {
        const errorData = await submissionResponse.json();
        throw new Error(errorData.message || 'Failed to create submission');
      }

      const fetchedSubmissions = await fetchSubmissionsFromAPI(problem.id);
      if (fetchedSubmissions) {
        setSubmissions(fetchedSubmissions);
        setAttempts(fetchedSubmissions.length);
      }

      const newAiMessage = {
        text: `Score: ${score}/10\n\n${output}`,
        sender: 'ai' as const,
      };
      setMessages((prev) => [...prev, newAiMessage]);
    } catch (error: any) {
      console.error('Error:', error);
      const errorMessage = {
        text: `Error: ${error.message || 'Something went wrong'}`,
        sender: 'ai' as const,
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process submission',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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
            prompt: input,
            customTestCase,
            problemDescription: problem.description,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to test prompt');
      }

      const data = await response.json();
      setTestResult(data.response);
    } catch (error: any) {
      console.error('Error testing prompt:', error);
      toast({
        title: 'Error Testing Prompt',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
      setError(error.message || 'Failed to test prompt with custom test case');
    } finally {
      setTestingCustom(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Your Prompt</h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <History className="h-4 w-4" />
                History
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Submission History</DialogTitle>
                <DialogDescription>
                  Your previous submissions for this problem.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                {submissions.length > 0 ? (
                  submissions.map((submission, index) => (
                    <div
                      key={index}
                      className="rounded-lg border p-4 shadow-sm"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-foreground font-semibold">
                          Attempt {index + 1}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-medium ${
                            submission.score >= 8
                              ? 'border-dynamic-light-green/10 bg-dynamic-green/10 text-dynamic-light-green'
                              : submission.score >= 5
                                ? 'border-dynamic-light-yellow/10 bg-dynamic-yellow/10 text-dynamic-light-yellow'
                                : 'border-dynamic-light-red/10 bg-dynamic-red/10 text-dynamic-light-red'
                          }`}
                        >
                          Score: {submission.score}/10
                        </span>
                      </div>
                      <Separator className="my-2" />
                      <div className="mt-2">
                        <p className="text-muted-foreground text-sm font-medium">
                          Your Prompt:
                        </p>
                        <p className="text-foreground mt-1 text-sm">
                          {submission.input}
                        </p>
                      </div>
                      <div className="mt-4">
                        <p className="text-muted-foreground text-sm font-medium">
                          Output:
                        </p>
                        <p className="text-foreground mt-1 text-sm">
                          {submission.output}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center">
                    No submissions yet.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4">
          <p>
            You have {3 - attempts} attempts remaining for this question. [
            {attempts}/3]
          </p>
        </div>

        <Tabs defaultValue="submit">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="submit">Submit Prompt</TabsTrigger>
            <TabsTrigger value="test">Test Custom Case</TabsTrigger>
          </TabsList>

          <TabsContent value="submit" className="space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <LoadingIndicator />
              </div>
            )}

            {!loading && submissions.length > 0 && (
              <div className="border-foreground/10 bg-foreground/10 text-foreground mx-auto flex max-w-3xl flex-col items-center justify-center space-y-6 rounded-lg border p-6 shadow-md">
                <h3 className="text-2xl font-semibold">Your Last Attempt</h3>
                <div className="border-foreground/5 bg-foreground/5 w-full rounded-lg border p-4 shadow-md">
                  <div className="space-y-4">
                    <div>
                      <p className="text-foreground text-sm">
                        <strong className="font-medium">Prompt: </strong>
                        {submissions[submissions?.length - 1]?.input}
                      </p>
                    </div>
                    <div>
                      <p className="text-foreground text-sm">
                        <strong className="font-medium">Score: </strong>
                        {submissions[submissions?.length - 1]?.score}/10
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                  disabled={attempts <= 0}
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
                  <h4 className="mb-2 text-lg font-medium">Test Results</h4>
                  <div className="space-y-3">
                    <div>
                      <span className="font-semibold">Score: </span>
                      <span
                        className={
                          testResult.score >= 8
                            ? 'text-dynamic-light-green'
                            : testResult.score >= 5
                              ? 'text-dynamic-light-yellow'
                              : 'text-dynamic-light-red'
                        }
                      >
                        {testResult.score}/10
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold">Feedback: </span>
                      <p className="mt-1 whitespace-pre-wrap text-sm">
                        {testResult.feedback}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Chat Input */}
      <div className="flex gap-2 p-2">
        <Input
          placeholder="Type your prompt..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || attempts >= 3}
        />
        <Button onClick={handleSend} disabled={loading || attempts >= 3}>
          {loading ? 'Sending...' : 'Submit'}
        </Button>
      </div>
      {error && <p className="mt-2 text-red-500">{error}</p>}
    </div>
  );
}

async function fetchSubmissionsFromAPI(problemId: string) {
  const response = await fetch(`/api/v1/problems/${problemId}/submissions`);
  const data = await response.json();

  if (response.ok) {
    return data;
  } else {
    console.log('Error fetching data');
    return null;
  }
}
