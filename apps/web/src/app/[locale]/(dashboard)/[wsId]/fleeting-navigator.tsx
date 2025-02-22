'use client';

import FleetingAssistant from './fleeting-assistant';
import FleetingNavigatorMenu from './fleeting-navigator-menu';
import { useClickOutside } from '@mantine/hooks';
import { useChat } from '@tuturuuu/ai/react';
import { AIChat } from '@tuturuuu/types/db';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function FleetingNavigator({ wsId }: { wsId: string }) {
  const disabledPaths = [
    `/${wsId}/chat`,
    `/${wsId}/mail`,
    `/${wsId}/calendar`,
    `/${wsId}/documents`,
    `/${wsId}/education`,
    `/${wsId}/ai/playground`,
  ];

  const t = useTranslations();
  const pathname = usePathname();

  const [currentView, setCurrentView] = useState<
    'assistant' | 'search' | 'settings'
  >();

  const defaultProvider = 'google';
  const defaultModel = 'gemini-2.0-flash-001';

  const [chat, setChat] = useState<Partial<AIChat> | undefined>();

  const { messages, setMessages } = useChat({
    id: chat?.id,
    //   initialMessages,
    api: `/api/ai/chat/${defaultProvider}`,
    body: {
      id: chat?.id,
      wsId,
    },
    onResponse(response) {
      if (!response.ok)
        toast({
          title: t('ai_chat.something_went_wrong'),
          description: t('ai_chat.try_again_later'),
        });
    },
    onError() {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: t('ai_chat.try_again_later'),
      });
    },
  });

  const [scrollPosition, setScrollPosition] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const ref = useClickOutside(() => setCurrentView(undefined));

  if (disabledPaths.some((path) => pathname.startsWith(path))) return null;

  const createChat = async (input: string) => {
    const res = await fetch(`/api/ai/chat/${defaultProvider}/new`, {
      method: 'POST',
      body: JSON.stringify({
        message: input,
      }),
    });

    if (!res.ok) {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: res.statusText,
      });
      return;
    }

    const { id, title } = (await res.json()) as AIChat;
    if (id) setChat({ id, title, model: defaultModel });
    return { id, title, model: defaultModel } as AIChat;
  };

  return (
    <>
      {/* {scrollPosition ? <div className="m-2 h-14" /> : null} */}
      {scrollPosition ? <div className="" /> : null}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 hidden items-center justify-center md:flex">
        <div
          ref={ref}
          className={`pointer-events-auto bg-secondary/10 backdrop-blur-lg md:m-4 ${
            currentView
              ? 'h-[32rem] w-[32rem] rounded-t-lg border-t md:rounded-lg md:border'
              : 'mb-4 h-14 rounded-lg border p-2'
          } transition-all duration-300`}
        >
          {currentView === 'assistant' ? (
            <FleetingAssistant
              wsId={wsId}
              chat={chat}
              model={defaultProvider}
              messages={messages}
              onBack={() => setCurrentView(undefined)}
              onReset={() => {
                setMessages([]);
                setChat(undefined);
              }}
              onSubmit={async (prompt) => {
                return chat?.id ? chat : await createChat(prompt);
              }}
            />
          ) : (
            <FleetingNavigatorMenu setCurrentView={setCurrentView} />
          )}
        </div>
      </div>
    </>
  );
}
