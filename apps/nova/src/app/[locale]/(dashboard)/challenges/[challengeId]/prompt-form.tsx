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
import { History } from 'lucide-react';
import React, { useEffect, useState } from 'react';

type HistoryEntry = {
  score: number;
  input: string;
  output: string;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

    if (attempts >= 5) {
      setError('You have reached the maximum number of attempts.');
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
      await addSubmission(input, output, score, problem.id);

      // Refresh submissions
      const fetchedSubmissions = await fetchSubmissionsFromAPI(problem.id);
      if (fetchedSubmissions) {
        setSubmissions(fetchedSubmissions);
        setAttempts(fetchedSubmissions.length);
      }

      // Add AI response to chat
      const newAiMessage = {
        text: `Score: ${score}/10\n\n${output}`,
        sender: 'ai' as const,
      };
      setMessages((prev) => [...prev, newAiMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = {
        text: 'Sorry, there was an error processing your request.',
        sender: 'ai' as const,
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast({
        title: 'Error',
        description: 'Failed to update submissions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addSubmission = async (
    input: string,
    output: string,
    score: number,
    problemId: string
  ) => {
    try {
      const response = await fetch(
        `/api/v1/problems/${problemId}/submissions`,
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

      if (!response.ok) {
        throw new Error('Failed to update submissions');
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update submissions',
        variant: 'destructive',
      });
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
                        <span className="font-semibold text-foreground">
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
                        <p className="text-sm font-medium text-muted-foreground">
                          Your Prompt:
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {submission.input}
                        </p>
                      </div>
                      <div className="mt-4">
                        <p className="text-sm font-medium text-muted-foreground">
                          Output:
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {submission.output}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-muted-foreground">
                    No submissions yet.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4">
          <p>You only have 5 tries for each question. [{attempts}/5]</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <LoadingIndicator />
          </div>
        )}

        {!loading && submissions.length > 0 && (
          <div className="mx-auto flex max-w-3xl flex-col items-center justify-center space-y-6 rounded-lg border border-foreground/10 bg-foreground/10 p-6 text-foreground shadow-md">
            <h3 className="text-2xl font-semibold">Your Last Attempt</h3>
            <div className="w-full rounded-lg border border-foreground/5 bg-foreground/5 p-4 shadow-md">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-foreground">
                    <strong className="font-medium">Prompt: </strong>
                    {submissions[submissions?.length - 1]?.input}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-foreground">
                    <strong className="font-medium">Score: </strong>
                    {submissions[submissions?.length - 1]?.score}/10
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div className="flex gap-2 p-2">
        <Input
          placeholder="Type your answer..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || attempts >= 5}
        />
        <Button onClick={handleSend} disabled={loading || attempts >= 5}>
          {loading ? 'Sending...' : 'Send'}
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
