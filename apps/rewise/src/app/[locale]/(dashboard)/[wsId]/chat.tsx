'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { useChat } from '@tuturuuu/ai/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { getCurrentUserProfile, updateAiChat } from '@tuturuuu/internal-api';
import type { AIChat, AIModelUI } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { cn } from '@tuturuuu/utils/format';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatList } from '@/components/chat-list';
import { ChatPanel } from '@/components/chat-panel';
import { ChatScrollAnchor } from '@/components/chat-scroll-anchor';
import { EmptyScreen } from '@/components/empty-screen';
import {
  DEFAULT_CHAT_MODEL,
  getChatRouteProvider,
  toChatModel,
} from '@/lib/chat-model';
import {
  getRewiseChatPath,
  getRewiseWorkspacePath,
} from '@/lib/workspace-routes';

export interface ChatProps extends React.ComponentProps<'div'> {
  inputModel?: AIModelUI;
  defaultChat?: Partial<AIChat>;
  initialMessages?: UIMessage[];
  chats?: AIChat[];
  count?: number | null;
  locale: string;
  workspaceSlug: string;
  noEmptyPage?: boolean;
  disabled?: boolean;
  wsId: string;
}

export default function Chat({
  inputModel = DEFAULT_CHAT_MODEL,
  defaultChat,
  initialMessages,
  chats,
  count,
  className,
  locale,
  workspaceSlug,
  noEmptyPage,
  disabled,
  wsId,
}: ChatProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [chat, setChat] = useState<Partial<AIChat> | undefined>(defaultChat);
  const model = inputModel;
  const [input, setInput] = useState('');
  const { data: currentUser } = useQuery({
    queryKey: ['current-user-profile'],
    queryFn: () => getCurrentUserProfile(),
  });
  const currentUserId = currentUser?.id;
  const {
    id: chatId,
    messages,
    sendMessage,
    stop,
    status,
  } = useChat({
    id: chat?.id,
    generateId: generateRandomUUID,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api:
        chat?.model || model?.value
          ? `/api/ai/chat/${getChatRouteProvider()}`
          : undefined,
      credentials: 'include',
      headers: { 'Custom-Header': 'value' },
      body: {
        model: chat?.model || model?.value,
        wsId,
      },
    }),
    onError() {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: t('ai_chat.try_again_later'),
      });
    },
  });

  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | undefined>(
    chat?.summary || ''
  );

  const updateChatSummaryMutation = useMutation({
    mutationFn: async ({
      id,
      model: modelId,
    }: {
      id: string;
      model: string;
    }) => {
      const res = await fetch(
        `/api/ai/chat/${getChatRouteProvider()}/summary`,
        {
          credentials: 'include',
          method: 'PATCH',
          body: JSON.stringify({ id, model: modelId, wsId }),
        }
      );
      if (!res.ok) throw new Error(res.statusText);
      const data = (await res.json()) as { response: string };
      return data.response;
    },
    onError: (error) => {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const createChatMutation = useMutation({
    mutationFn: async ({
      id,
      model: modelId,
      message,
    }: {
      id: string;
      model: string;
      message: string;
    }) => {
      const res = await fetch(`/api/ai/chat/${getChatRouteProvider()}/new`, {
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({ id, model: modelId, message, wsId }),
      });
      if (!res.ok) throw new Error(res.statusText);
      return (await res.json()) as AIChat;
    },
    onError: (error) => {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  useEffect(() => {
    setSummary(chat?.summary || '');
    setSummarizing(false);
  }, [chat?.summary]);

  useEffect(() => {
    if (!chat || status === 'streaming') return;

    const generateSummary = async (messages: UIMessage[] = []) => {
      if (
        summary ||
        summarizing ||
        !chat?.id ||
        !chat?.model ||
        !messages?.length ||
        chat.summary ||
        chat.latest_summarized_message_id ||
        chat.latest_summarized_message_id === messages[messages.length - 1]?.id
      )
        return;

      setSummarizing(true);
      try {
        const response = await updateChatSummaryMutation.mutateAsync({
          id: chat.id,
          model: chat.model,
        });
        if (response) setSummary(response);
      } finally {
        setSummarizing(false);
      }
    };

    const lastMessage = messages[messages.length - 1];

    if (
      status === 'ready' &&
      !summary &&
      !chat.latest_summarized_message_id &&
      chat.latest_summarized_message_id !== lastMessage?.id &&
      lastMessage?.role !== 'user'
    )
      generateSummary(messages);
  }, [chat, messages, status, summarizing, summary, updateChatSummaryMutation]);

  const [initialScroll, setInitialScroll] = useState(true);

  const clearChat = useCallback(() => {
    setSummary(undefined);
    setChat(undefined);
    setCollapsed(true);
    setInput('');

    if (chat?.id) {
      router.push(getRewiseWorkspacePath(workspaceSlug, 'new'));
    }
  }, [chat?.id, router, workspaceSlug]);

  useEffect(() => {
    const input = searchParams.get('ai_chat.input');
    const refresh = searchParams.get('ai_chat.refresh');

    if ((initialScroll || refresh) && !input && chats && count !== undefined) {
      setInitialScroll(false);
      const mainChatContent = document.getElementById('main-chat-content');

      if (mainChatContent) {
        const scrollTop = chat?.id ? mainChatContent.scrollTop : 0;
        mainChatContent.scrollTo({
          top: scrollTop,
          behavior: 'smooth',
        });
      }
    }

    if (chat?.id && input) {
      setInput(input.toString());
    }

    if (refresh) {
      clearChat();
      router.replace(getRewiseWorkspacePath(workspaceSlug, 'new'));
      router.refresh();
    }
  }, [
    chat?.id,
    searchParams,
    router,
    chats,
    count,
    initialScroll,
    clearChat,
    workspaceSlug,
  ]);

  const [collapsed, setCollapsed] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const createChat = async (input: string) => {
    if (!model) return;

    setPendingPrompt(input);

    try {
      const { id, title } = await createChatMutation.mutateAsync({
        id: chatId,
        model: model.value,
        message: input,
      });
      if (id) {
        setCollapsed(true);
        setChat({ id, title, model: model.value, is_public: false });
      }
    } catch {
      setPendingPrompt(null);
      setInput(input);
      throw new Error('Unable to create chat');
    }
  };

  const updateChat = async (newData: Partial<AIChat>) => {
    if (!chat?.id) return;

    try {
      await updateAiChat(chat.id, {
        is_public: newData.is_public,
        title: newData.title,
        pinned: newData.pinned,
      });
    } catch (error) {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description:
          error instanceof Error ? error.message : t('ai_chat.try_again_later'),
      });
      return;
    }

    setChat({ ...chat, ...newData });
    toast({
      title: t('ai_chat.chat_updated'),
      description: t('ai_chat.visibility_updated_desc'),
    });
  };

  useEffect(() => {
    if (!pendingPrompt || !chat?.id) return;
    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: pendingPrompt }],
    });
    setPendingPrompt(null);
  }, [chat?.id, pendingPrompt, sendMessage]);

  useEffect(() => {
    if (!pathname.includes('/c/') && messages.length === 1) {
      if (chat?.id) {
        window.history.replaceState(
          {},
          '',
          getRewiseChatPath(workspaceSlug, chat.id)
        );
      }
    }
  }, [chat?.id, pathname, messages, workspaceSlug]);

  return (
    <div
      className={cn(
        'relative flex h-[calc(100vh-5rem)] min-h-0 flex-col overflow-hidden md:h-[calc(100vh-2rem)]',
        className
      )}
    >
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:gap-4 xl:h-full">
        <div className="relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/50 p-3 pb-0 shadow-sm backdrop-blur-sm sm:p-4">
          <div
            id="main-chat-content"
            className="min-h-0 flex-1 overflow-y-auto pt-10 pb-32"
          >
            {(chat && messages.length) || pendingPrompt ? (
              <>
                <ChatList
                  chatId={chat?.id}
                  chatTitle={chat?.title}
                  chatIsPublic={chat?.is_public}
                  chatModel={chat?.model}
                  chatSummary={summary || chat?.summary}
                  summarizing={summarizing}
                  messages={
                    pendingPrompt
                      ? [
                          {
                            id: 'pending',
                            role: 'user',
                            parts: [{ type: 'text', text: pendingPrompt }],
                          },
                        ]
                      : messages
                  }
                  setInput={setInput}
                  locale={locale}
                  model={chat?.model ?? undefined}
                  anonymize={!chats || count === undefined}
                />
                <ChatScrollAnchor trackVisibility={status === 'streaming'} />
              </>
            ) : noEmptyPage ? (
              <div className="flex h-full w-full items-center justify-center font-bold text-2xl lg:text-4xl xl:text-5xl">
                {t('common.coming_soon')}
              </div>
            ) : (
              <EmptyScreen
                assistantName="Mira"
                setInput={setInput}
                userName={
                  currentUser?.display_name ||
                  currentUser?.full_name ||
                  currentUser?.email?.split('@')[0] ||
                  undefined
                }
              />
            )}
          </div>

          <ChatPanel
            id={chat?.id}
            chat={chat}
            chats={chats}
            count={count}
            status={status}
            stop={stop}
            sendMessage={sendMessage}
            input={input}
            inputRef={inputRef}
            setInput={setInput}
            assistantName="Mira"
            model={toChatModel(chat?.model) ?? model}
            messages={messages}
            collapsed={collapsed}
            createChat={createChat}
            updateChat={updateChat}
            clearChat={clearChat}
            setCollapsed={setCollapsed}
            disabled={disabled}
            currentUserId={currentUserId}
            wsId={wsId}
          />
        </div>
      </div>
    </div>
  );
}
