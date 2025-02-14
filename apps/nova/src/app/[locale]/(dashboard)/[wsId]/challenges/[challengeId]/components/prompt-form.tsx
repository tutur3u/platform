'use client';

import { Problems } from '../../challenges';
import Mosaic from '@/components/common/LoadingIndicator';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import { History } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

// import { Dialog } from '@repo/ui/components/ui/dialog';
export default function ChatBox({ problem }: { problem: Problems }) {
  const [messages, setMessages] = useState<
    { text: string; sender: 'user' | 'ai' }[]
  >([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false); // Loading state
  const [attempts, setAttempts] = useState(0); // Attempts counter
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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
          body: JSON.stringify({ feedback, score, user_prompt }),
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

  // Auto-scroll to the latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

      // Call updateProblemHistory after receiving AI response
      if (data.response?.score !== undefined && data.response?.feedback) {
        await updateProblemHistory(
          problem.id, // Problem ID from the prop
          data.response.feedback, // Feedback from AI
          data.response.score, // Score from AI
          input // User's input (the prompt)
        );
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
    <div className="flex h-full flex-col p-4">
      <h2 className="text-lg font-bold">Chat Box</h2>
      <div className="mb-2 flex items-center text-gray-500">
        <p className="mr-2">
          You only have 5 tries for each question. [{attempts}/5]
        </p>
        <div>
          <History size={16} />
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto rounded-md border p-2">
        {/* {messages.map((msg, index) => (
          <div
            key={index}
            className={`max-w-[80%] rounded-lg p-2 ${
              msg.sender === 'user'
                ? 'self-end bg-blue-500 text-white'
                : 'self-start bg-gray-300 text-black'
            }`}
          >
            {msg.text}
          </div>
        ))} */}

        {/* Loading Indicator */}
        {/* {loading && (
          <div className="max-w-[80%] self-start rounded-lg bg-gray-300 p-2 text-black">
            Typing...
          </div>
        )} */}
        {loading && (
          <div className="flex h-screen items-center justify-center">
            <Mosaic className="h-6" />
            <p>We are processing your prompt please wait...</p>
          </div>
        )}

        <div ref={chatEndRef} />
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
