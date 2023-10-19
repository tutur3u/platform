'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useChat } from 'ai/react';
import ChatForm from './form';
import { User } from '@/types/primitives/User';
import { ArrowLeftToLine, FolderOpen, User as UserIcon } from 'lucide-react';
import { getInitials } from '@/utils/name-helper';
import useTranslation from 'next-translate/useTranslation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';

interface ChatProps {
  user: User;
}

const Chat = ({ user }: ChatProps) => {
  const { t } = useTranslation('ai-chat');
  const { messages, input, setInput, handleSubmit } = useChat();

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative flex">
      <div
        id="chat-sidebar"
        className={`absolute grid h-fit w-full max-w-xs rounded-lg border transition-all duration-500 ${
          collapsed ? 'border-transparent' : 'border-foreground/5 p-2'
        }`}
      >
        <div className="flex w-full gap-2">
          <Button
            size="icon"
            className={`flex-none ${
              collapsed ? 'opacity-50 transition hover:opacity-100' : ''
            }`}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? (
              <FolderOpen className="h-5 w-5" />
            ) : (
              <ArrowLeftToLine className="h-5 w-5" />
            )}
          </Button>

          <Button
            variant="secondary"
            className={`w-full transition duration-300 ${
              collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
            disabled={!collapsed}
          >
            <div className="line-clamp-1">{t('new_chat')}</div>
          </Button>
        </div>

        <div
          className={`transition duration-300 ${
            collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <Separator className="my-2" />
          <Button className="w-full" disabled>
            {t('default_chat')}
          </Button>
        </div>
      </div>

      <div
        className={`flex h-full w-full flex-col gap-2 overflow-y-auto pb-16 transition-all duration-500 ${
          collapsed ? 'ml-0' : `ml-[21rem]`
        }`}
      >
        {messages.length > 0 ? (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2 whitespace-pre-wrap ${
                m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {m.role === 'user' ? (
                <Avatar className="hidden md:block">
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
                <Avatar className="hidden md:block">
                  <AvatarImage src="/rewise-green.png" alt="Tuturuuu Logo" />
                  <AvatarFallback className="font-semibold">AI</AvatarFallback>
                </Avatar>
              )}

              <div className="border-foreground/5 bg-foreground/5 max-w-[80%] rounded-xl border px-3 py-2">
                {m.content.trim()}
              </div>
            </div>
          ))
        ) : (
          <div className="text-foreground/50 absolute inset-0 mt-32 text-center text-xl font-semibold md:text-2xl">
            {t('prompt')}
          </div>
        )}
      </div>

      <div
        id="chat-bar"
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center backdrop-blur"
      >
        <div className="border-foreground/20 bg-background/50 rounded-t-lg border border-b-0 p-2">
          <ChatForm
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
};

export default Chat;
