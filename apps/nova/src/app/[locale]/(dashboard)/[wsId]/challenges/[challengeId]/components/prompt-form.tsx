'use client';

import { Problems } from '../../challenges';
import Mosaic from '@/components/common/LoadingIndicator';
import { Button } from '@tutur3u/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tutur3u/ui/dialog';
import { Input } from '@tutur3u/ui/input';
import { Separator } from '@tutur3u/ui/separator';
import { History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

type HistoryEntry = {
  score: number;
  feedback: string;
  user_prompt: string;
};
export default function ChatBox({
  problem,
  challengeId,
}: {
  problem: Problems;
  challengeId: string;
}) {
  const [_messages, setMessages] = useState<
    { text: string; sender: 'user' | 'ai' }[]
  >([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [_history, setHistory] = useState<HistoryEntry[]>([]);
  const [attempts, setAttempts] = useState(0);

  const router = useRouter();
  useEffect(() => {
    const fetchHistory = async () => {
      if (problem?.id) {
        const fetchedHistory = await fetchProblemHistoryFromAPI(problem.id);
        if (fetchedHistory) {
          setHistory(fetchedHistory);
          setAttempts(fetchedHistory.length);
        }
      }
    };

    fetchHistory();
  }, [problem?.id]);

  const updateProblemHistory = async (
    problemId: string,
    feedback: string,
    score: number,
    user_prompt: string
  ) => {
    try {
      const response = await fetch(
        `/api/auth/workspace/${problemId}/nova/prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback, score, user_prompt, challengeId }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update problem history');
      }

      const data = await response.json();
      console.log('Update Response:', data);
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
    setAttempts((prev) => prev + 1);

    try {
      const response = await fetch('/api/ai/chat/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemDescription: problem.description,
          testCase: problem.testcase,
          answer: input,
          exampleOutput: problem.exampleOutput,
          exampleInput: problem.exampleInput,
        }),
      });

      const data = await response.json();
      console.log(data);

      const aiResponseText =
        data.response?.score !== undefined && data.response?.feedback
          ? `Score: ${data.response.score}/10 - ${data.response.feedback}`
          : "I couldn't process that. Try again!";

      const newAIMessage = { text: aiResponseText, sender: 'ai' as const };
      setMessages((prev) => [...prev, newAIMessage]);

      if (data.response?.score !== undefined && data.response?.feedback) {
        await updateProblemHistory(
          problem.id,
          data.response.feedback,
          data.response.score,
          input
        );
      }
      const fetchedHistory = await fetchProblemHistoryFromAPI(problem.id);
      setHistory(fetchedHistory);
      router.refresh();
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
    <div className="flex h-full flex-col p-4">
      <h2 className="text-lg font-bold">Chat Box</h2>
      <div className="mb-2 flex items-center text-gray-500">
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
              {_history && _history.length > 0 ? (
                <ul>
                  {_history.map((entry, index) => (
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

      <div className="flex-1 space-y-2 rounded-md border p-2">
        {loading && (
          <div className="flex h-screen items-center justify-center">
            <Mosaic className="h-6" />
            <p>We are processing your prompt please wait...</p>
          </div>
        )}

        {!loading && _history.length > 0 && (
          <div className="mx-auto flex max-w-3xl flex-col items-center justify-center space-y-6 rounded-lg bg-gray-50 p-6 shadow-md">
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
                    {_history[_history?.length - 1]?.user_prompt}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">
                    <strong className="font-medium text-gray-900">
                      Score:{' '}
                    </strong>
                    {_history[_history?.length - 1]?.score}/10
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div />
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

async function fetchProblemHistoryFromAPI(problemId: string) {
  const response = await fetch(`/api/auth/workspace/${problemId}/nova/prompt`);
  const data = await response.json();

  if (response.ok) {
    return data;
  } else {
    console.log('Error fetching data');
    return null;
  }
}
