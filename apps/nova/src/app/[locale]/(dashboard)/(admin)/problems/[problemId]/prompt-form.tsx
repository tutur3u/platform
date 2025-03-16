'use client';

import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { PlayCircle } from 'lucide-react';
import React, { useState } from 'react';

type TestResult = {
  score: number;
  feedback: string;
  suggestions: string;
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
  const [messages, setMessages] = useState<
    { text: string; sender: 'user' | 'ai' }[]
  >([]);
  const [prompt, setPrompt] = useState('');
  const [score, setScore] = useState(0);
  const [customTestCase, setCustomTestCase] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingCustom, setTestingCustom] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);

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

    if (prompt.length > problem.maxPromptLength) {
      setError('Prompt length exceeds the maximum allowed length.');
      return;
    }

    if (loading) {
      setError('Please wait for the previous attempt to complete.');
      return;
    }

    const newUserMessage = { text: prompt, sender: 'user' as const };
    setMessages((prev) => [...prev, newUserMessage]);
    setPrompt('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/v1/problems/${problem.id}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process submission');
      }

      const data = await response.json();
      const feedback = data.response.feedback || '';
      const score = data.response.score || 0;
      setScore(score);

      const newAiMessage = {
        text: `Score: ${score}/10\n\n${feedback}`,
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
    if (!prompt.trim()) {
      setError('Prompt cannot be empty when testing a custom case.');
      return;
    }

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
          body: JSON.stringify({ prompt, customTestCase }),
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
    } finally {
      setTestingCustom(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Your Prompt</h2>
        </div>

        <Tabs defaultValue="submit">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="submit">Submit Prompt</TabsTrigger>
            <TabsTrigger value="test">Test Custom Case</TabsTrigger>
          </TabsList>

          <TabsContent value="submit" className="space-y-4 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-10">
                <LoadingIndicator />
              </div>
            )}

            {!loading && (
              <div className="mx-auto flex max-w-3xl flex-col items-center justify-center space-y-6 rounded-lg border border-foreground/10 bg-foreground/10 p-6 text-foreground shadow-md">
                <h3 className="text-2xl font-semibold">Your Last Attempt</h3>
                <div className="w-full rounded-lg border border-foreground/5 bg-foreground/5 p-4 shadow-md">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-foreground">
                        <strong className="font-medium">Prompt: </strong>
                        {messages.length > 0 &&
                        messages[messages.length - 2]?.sender === 'user'
                          ? messages[messages.length - 2]?.text
                          : 'No attempts yet'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-foreground">
                        <strong className="font-medium">Score: </strong>
                        {score}/10
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="test" className="space-y-4 overflow-y-auto">
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
                <Button onClick={handleTestCustomCase} className="mt-3 gap-2">
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
                      <p className="mt-1 text-sm whitespace-pre-wrap">
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
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <Button onClick={handleSend} disabled={loading}>
          {loading ? 'Sending...' : 'Submit'}
        </Button>
      </div>
      {error && <p className="mt-2 text-red-500">{error}</p>}
    </div>
  );
}
