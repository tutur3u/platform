'use client';

import FleetingAssistant from './fleeting-assistant';
import FleetingNavigatorMenu from './fleeting-navigator-menu';
import { toast } from '@/components/ui/use-toast';
import { AIChat } from '@/types/primitives/ai-chat';
import { useClickOutside } from '@mantine/hooks';
import { useChat } from 'ai/react';
import useTranslation from 'next-translate/useTranslation';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function FleetingNavigator({ wsId }: { wsId: string }) {
  const disabledPaths = [`/${wsId}/chat`, `/${wsId}/ai/playground`];

  const { t } = useTranslation('sidebar-tabs');
  const pathname = usePathname();

  const [currentView, setCurrentView] = useState<
    'assistant' | 'search' | 'settings'
  >();

  const [chat, setChat] = useState<AIChat | undefined>();
  const [model] = useState<'google' | 'anthropic'>('google');

  const { messages, setMessages } = useChat({
    id: chat?.id,
    //   initialMessages,
    api: `/api/ai/chat/${model}`,
    body: {
      id: chat?.id,
      wsId,
    },
    onResponse(response) {
      if (!response.ok)
        toast({
          title: t('something_went_wrong'),
          description: t('try_again_later'),
        });
    },
    onError(_) {
      toast({
        title: t('something_went_wrong'),
        description: t('try_again_later'),
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
    const res = await fetch(`/api/ai/chat/${model}/new`, {
      method: 'POST',
      body: JSON.stringify({
        message: input,
      }),
    });

    if (!res.ok) {
      toast({
        title: t('something_went_wrong'),
        description: res.statusText,
      });
      return;
    }

    const { id, title } = await res.json();
    if (id) setChat({ id, title, model: 'GOOGLE-GEMINI-PRO' });

    return { id, title, model: 'GOOGLE-GEMINI-PRO' } as AIChat;
  };

  return (
    <>
      {scrollPosition ? <div className="m-2 h-14" /> : null}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex items-center justify-center">
        <div
          ref={ref}
          className={`bg-secondary/10 pointer-events-auto backdrop-blur-lg md:m-4 ${
            currentView
              ? 'h-[32rem] w-[32rem] rounded-t-lg border-t md:rounded-lg md:border'
              : 'mb-4 h-14 w-40 rounded-lg border'
          } transition-all duration-300`}
        >
          {currentView === 'assistant' ? (
            <FleetingAssistant
              wsId={wsId}
              chat={chat}
              model={model}
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
