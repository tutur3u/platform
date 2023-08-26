'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useChat } from 'ai/react';
import ChatForm from './form';
import { User } from '@/types/primitives/User';
import LogoutButton from '@/components/LogoutButton';
import { Button } from '@/components/ui/button';

interface ChatProps {
  userData: User;
}

const Chat = ({ userData }: ChatProps) => {
  const { messages, setMessages, input, setInput, handleSubmit } = useChat();

  const resetChat = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className="flex h-screen flex-col overflow-y-auto">
      <div className="bg-background grid w-full px-4 py-1 text-right">
        <div className="font-semibold">{userData.email}</div>
        <LogoutButton />
      </div>

      <div className="border-foreground/10 flex h-full flex-col gap-2 overflow-y-auto border-y p-4 md:px-8 lg:px-16 xl:px-32">
        {messages.length > 0 ? (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 whitespace-pre-wrap ${
                m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {m.role === 'user' ? (
                <Avatar>
                  <AvatarImage
                    src={userData?.avatar_url || '/dark.png'}
                    alt="Tuturuuu Logo"
                  />
                  <AvatarFallback>T</AvatarFallback>
                </Avatar>
              ) : (
                <Avatar>
                  <AvatarImage src="/rewise-green.png" alt="Tuturuuu Logo" />
                  <AvatarFallback>RW</AvatarFallback>
                </Avatar>
              )}
              <div className="border-foreground/5 bg-foreground/5 rounded-xl border px-3 py-2">
                {m.content.trim()}
              </div>
            </div>
          ))
        ) : (
          <div className="text-foreground/50 text-center text-2xl font-semibold">
            Enter a prompt to start chatting with Rewise AI
          </div>
        )}
      </div>

      <div className="bg-background flex w-full items-center justify-between px-4 py-2">
        <Button variant="ghost" className="pointer-events-none opacity-0">
          Reset chat
        </Button>

        <ChatForm
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
        />

        <Button
          onClick={resetChat}
          variant="ghost"
          disabled={!messages.length && !input}
        >
          Reset chat
        </Button>
      </div>
    </div>
  );
};

export default Chat;
