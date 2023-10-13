'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useChat } from 'ai/react';
import ChatForm from './form';
import { User } from '@/types/primitives/User';
import { Button } from '@/components/ui/button';
import { User as UserIcon } from 'lucide-react';
import { getInitials } from '@/utils/name-helper';
import useTranslation from 'next-translate/useTranslation';

interface ChatProps {
  user: User;
}

const Chat = ({ user }: ChatProps) => {
  const { t } = useTranslation('ai-chat');
  const { messages, setMessages, input, setInput, handleSubmit } = useChat();

  const resetChat = () => {
    setMessages([]);
    setInput('');
  };

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="flex h-full flex-col gap-2 overflow-y-auto p-4 pb-24 md:px-8 lg:px-16 xl:px-32">
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
                    src={user?.avatar_url || '/dark.png'}
                    alt="Tuturuuu Logo"
                  />
                  <AvatarFallback className="font-semibold">
                    {user?.display_name ? (
                      getInitials(user.display_name)
                    ) : (
                      <UserIcon className="h-5 w-5" />
                    )}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <Avatar>
                  <AvatarImage src="/rewise-green.png" alt="Tuturuuu Logo" />
                  <AvatarFallback className="font-semibold">AI</AvatarFallback>
                </Avatar>
              )}
              <div className="border-foreground/5 bg-foreground/5 rounded-xl border px-3 py-2">
                {m.content.trim()}
              </div>
            </div>
          ))
        ) : (
          <div className="text-foreground/50 mt-32 text-center text-xl font-semibold md:text-2xl">
            {t('prompt')}
          </div>
        )}
      </div>

      <div className="border-foreground/10 bg-background fixed inset-x-0 bottom-0 flex w-full items-center justify-between border-t px-2 py-2 md:px-4">
        <Button
          variant="ghost"
          className="pointer-events-none hidden opacity-0 md:block"
        >
          {t('reset_chat')}
        </Button>

        <ChatForm
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
        />

        <Button
          onClick={resetChat}
          variant="ghost"
          className="hidden md:block"
          disabled={!messages.length && !input}
        >
          {t('reset_chat')}
        </Button>
      </div>
    </div>
  );
};

export default Chat;
