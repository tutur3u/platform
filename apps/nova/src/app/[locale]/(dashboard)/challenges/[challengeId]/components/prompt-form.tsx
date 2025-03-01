'use client';

import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import { History } from 'lucide-react';
import React, { useEffect, useState } from 'react';

type HistoryEntry = {
  score: number;
  feedback: string;
  user_prompt: string;
};

interface Problem {
  id: string;
  title: string;
  description: string;
  example_input: string;
  example_output: string;
  testcases: string[];
}

export default function ChatBox({ problem }: { problem: Problem }) {
  const [_messages, setMessages] = useState<
    { text: string; sender: 'user' | 'ai' }[]
  >([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [_submissions, setSubmissions] = useState<HistoryEntry[]>([]);
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

  const addSubmission = async (
    user_prompt: string,
    score: number,
    feedback: string,
    problemId: string
  ) => {
    try {
      const response = await fetch(
        `/api/v1/problems/${problemId}/submissions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_prompt,
            score,
            feedback,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update submissions');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading || attempts >= 5) return;

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
          exampleInput: problem.example_input,
          exampleOutput: problem.example_output,
        }),
      });

      const data = await response.json();

      const aiResponseText =
        data.response?.score !== undefined && data.response?.feedback
          ? `Score: ${data.response.score}/10 - ${data.response.feedback}`
          : "I couldn't process that. Try again!";

      const newAIMessage = { text: aiResponseText, sender: 'ai' as const };
      setMessages((prev) => [...prev, newAIMessage]);

      if (data.response?.score && data.response?.feedback) {
        await addSubmission(
          input,
          data.response.score,
          data.response.feedback,
          problem.id
        );
        setAttempts((prev) => prev + 1);

        const fetchedSubmissions = await fetchSubmissionsFromAPI(problem.id);
        setSubmissions(fetchedSubmissions);
      }
    } catch (error) {
      const errorMsg = {
        text: 'An error occurred. Please try again.',
        sender: 'ai' as const,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="round round-sm bg-foreground/10 text-foreground flex h-full flex-col p-4">
      <h2 className="text-lg font-bold">Chat Box</h2>
      <div className="mb-2 flex items-center">
        <p className="mr-2">
          You only have 5 tries for each question. [{attempts}/5]
        </p>

        <Dialog>
          <DialogTrigger>
            <History size={16} />
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Problem History</DialogTitle>
              <DialogDescription>
                Below is the history of your attempts for this problem.
                Feedbacks will be provided after you finish the test.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[400px] overflow-y-auto">
              {_submissions && _submissions.length > 0 ? (
                <ul>
                  {_submissions.map((entry, index) => (
                    <li key={index}>
                      <div className="flex justify-between pt-5">
                        <span>Attempt {index + 1}:</span>
                        <span className="rounded-lg bg-gray-300 px-4 py-2 text-sm font-semibold">
                          Score: {entry.score}/10
                        </span>
                      </div>
                      <p>{entry.user_prompt}</p>
                      <Separator></Separator>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nothing to show yet!</p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-foreground/10 text-foreground flex-1 space-y-2 rounded-md border p-2">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center justify-center gap-2">
              <LoadingIndicator className="h-6" />
              <p>We are processing your prompt please wait...</p>
            </div>
          </div>
        )}

        {!loading && _submissions.length > 0 && (
          <div className="text-foreground mx-auto flex max-w-3xl flex-col items-center justify-center space-y-6 rounded-lg bg-gray-50 p-6 shadow-md">
            <h3 className="text-2xl font-semibold text-gray-800">
              Your Last Attempt
            </h3>
            <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-md">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">
                    <strong className="font-medium text-gray-900">
                      Prompt:{' '}
                    </strong>
                    {_submissions[_submissions?.length - 1]?.user_prompt}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">
                    <strong className="font-medium text-gray-900">
                      Score:{' '}
                    </strong>
                    {_submissions[_submissions?.length - 1]?.score}/10
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
          className="flex-1 rounded-md border p-2"
          placeholder="Type your answer..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || attempts >= 5}
        />
        <Button
          className="rounded-md bg-blue-600 px-4 py-2 text-white"
          onClick={handleSend}
          disabled={loading || attempts >= 5}
        >
          {loading ? 'Sending...' : 'Send'}
        </Button>
      </div>
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
