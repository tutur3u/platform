'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useChat } from 'ai/react';
import ChatForm from './form';
import { User } from '@/types/primitives/User';
import LogoutButton from '@/components/LogoutButton';

interface ChatProps {
  userData: User;
}

const Chat = ({ userData }: ChatProps) => {
  const { messages } = useChat({ id: 'default' });

  return (
    <div className="flex h-screen flex-col overflow-y-auto">
      <div className="bg-background grid w-full px-4 py-2 text-right">
        <div>{userData.email}</div>
        <LogoutButton />
      </div>

      <div className="border-foreground/10 flex h-full flex-col gap-2 overflow-y-auto border-y p-4">
        {messages.length > 0 ? (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 ${
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
                {m.content}
              </div>
            </div>
          ))
        ) : (
          <div className="text-foreground/50 text-center text-2xl font-semibold">
            Enter a prompt to start chatting with Rewise AI
          </div>
        )}
      </div>

      <div className="bg-background flex w-full items-center justify-center px-4 py-2">
        <ChatForm />
      </div>
    </div>
  );
};

export default Chat;
