'use client';

import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import React, { useEffect, useRef, useState } from 'react';

export default function ChatBox() {
  const [messages, _setMessages] = useState<
    { text: string; sender: 'user' | 'ai' }[]
  >([]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="text-lg font-bold">Chat Box</h2>
      <p className="mb-2 text-gray-500">
        Try to figure out the best prompt here...
      </p>

      {/* Chat Messages - Grows to take up available space */}
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
        <div ref={chatEndRef} />
      </div>

      {/* Chat Input - Fixed at the bottom */}
      <div className="flex gap-2 p-2">
        <Input
          className="flex-1 rounded-md border p-2"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter'}
        />
        <Button className="rounded-md bg-blue-600 px-4 py-2 text-white">
          Send
        </Button>
      </div>
    </div>
  );
}
