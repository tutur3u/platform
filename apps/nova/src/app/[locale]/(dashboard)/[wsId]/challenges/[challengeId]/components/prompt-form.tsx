'use client';

import { Problems } from '../../challenges';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import React, { useEffect, useRef, useState } from 'react';

export default function ChatBox({ problem }: { problem: Problems }) {
  const [messages, setMessages] = useState<
    { text: string; sender: 'user' | 'ai' }[]
  >([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false); // Loading state
  const [attempts, setAttempts] = useState(0); // Attempts counter
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle sending user message
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
          exampleInput:problem.exampleInput
        }),
      });

      const data = await response.json();
      console.log(data);
      const aiResponse =
        'Score: ' + data.response?.score + '-10 ' + data.response?.feedback ||
        "I couldn't process that. Try again!";

      const newAIMessage = { text: aiResponse, sender: 'ai' as const };
      setMessages((prev) => [...prev, newAIMessage]);
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
      <p className="mb-2 text-gray-500">
        You only have 5 tries for each question. [{attempts}/5]
      </p>

      {/* Chat Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto rounded-md border p-2">
        {messages.map((msg, index) => (
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
        ))}

        {/* Loading Indicator */}
        {loading && (
          <div className="max-w-[80%] self-start rounded-lg bg-gray-300 p-2 text-black">
            Typing...
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
