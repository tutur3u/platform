'use client';

import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { defaultModel, type Model, models } from '@tuturuuu/ai/models';
import { useChat } from '@tuturuuu/ai/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIChat } from '@tuturuuu/types';
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

export interface ChatProps extends React.ComponentProps<'div'> {
  defaultChat?: Partial<AIChat>;
  wsId?: string;
  initialMessages?: UIMessage[];
  chats?: AIChat[];
  count?: number | null;
  hasKeys: { openAI: boolean; anthropic: boolean; google: boolean };
  locale: string;
  disableScrollToTop?: boolean;
  disableScrollToBottom?: boolean;
}

export default function Chat({
  defaultChat,
  wsId,
  initialMessages,
  chats,
  count,
  className,
  hasKeys,
  locale,
  disableScrollToTop,
  disableScrollToBottom,
}: ChatProps) {
  const t = useTranslations('ai_chat');

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [chat, setChat] = useState<Partial<AIChat> | undefined>(defaultChat);
  const [model, setModel] = useState<Model | undefined>(defaultModel);
  const [input, setInput] = useState('');

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
          ? `/api/ai/chat/${(
              chat?.model
                ? models
                    .find((m) => m.value === chat.model)
                    ?.provider.toLowerCase() || model?.provider.toLowerCase()
                : model?.provider.toLowerCase()
            )?.replaceAll(' ', '-')}`
          : undefined,
      credentials: 'include',
      headers: { 'Custom-Header': 'value' },
      body: {
        // DO NOT PUT ID HERE AS IT WILL BE OVERRIDDEN BY chatId IN useChat
        wsId,
        model: chat?.model || model?.value,
      },
    }),
    onError() {
      toast({
        title: t('something_went_wrong'),
        description: t('try_again_later'),
      });
    },
  });

  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | undefined>(
    chat?.summary || ''
  );

  useEffect(() => {
    setSummary(chat?.summary || '');
    setSummarizing(false);
  }, [chat?.summary]);

  useEffect(() => {
    if (!chat || !hasKeys || status === 'streaming') return;

    const generateSummary = async (messages: UIMessage[] = []) => {
      if (
        !wsId ||
        summary ||
        summarizing ||
        !model ||
        !chat?.id ||
        !chat?.model ||
        !messages?.length ||
        chat.summary ||
        chat.latest_summarized_message_id ||
        chat.latest_summarized_message_id === messages[messages.length - 1]?.id
      )
        return;

      setSummarizing(true);

      const res = await fetch(
        `/api/ai/chat/${model.provider.toLowerCase().replace(' ', '-')}/summary`,
        {
          credentials: 'include',
          method: 'PATCH',
          body: JSON.stringify({
            id: chat.id,
            model: chat.model,
          }),
        }
      );

      if (!res.ok) {
        toast({
          title: t('something_went_wrong'),
          description: res.statusText,
        });
        return;
      }

      const { response } = (await res.json()) as { response: string };
      if (response) setSummary(response);
    };

    // Generate the chat summary if the chat's latest summarized message id
    // is not the same as the last message id in the chat
    const lastMessage = messages[messages.length - 1];

    if (
      wsId &&
      status === 'ready' &&
      !summary &&
      !chat.latest_summarized_message_id &&
      chat.latest_summarized_message_id !== lastMessage?.id &&
      lastMessage?.role !== 'user'
    )
      generateSummary(messages);
  }, [chat, hasKeys, messages, model, status, summarizing, summary, t, wsId]);

  const [initialScroll, setInitialScroll] = useState(true);

  const clearChat = useCallback(() => {
    if (defaultChat?.id) return;
    setSummary(undefined);
    setChat(undefined);
    setCollapsed(true);
  }, [defaultChat?.id]);

  useEffect(() => {
    // if there is "input" in the query string, we will
    // use that as the input for the chat, then remove
    // it from the query string
    const input = searchParams.get('input');
    const refresh = searchParams.get('refresh');

    if (
      (initialScroll || refresh) &&
      !input &&
      !!chats &&
      count !== undefined
    ) {
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
      if (disableScrollToBottom && disableScrollToTop) return;
      router.replace(`/${wsId}/chat/${chat.id}`);
    }

    if (refresh) {
      clearChat();
      router.replace(`/${wsId}/chat?`);
      router.refresh();
    }
  }, [
    chat?.id,
    searchParams,
    router,
    wsId,
    chats,
    count,
    initialScroll,
    disableScrollToBottom,
    disableScrollToTop,
    clearChat,
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

    const res = await fetch(
      `/api/ai/chat/${model.provider.toLowerCase().replace(' ', '-')}/new`,
      {
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({
          id: chatId,
          model: model.value,
          message: input,
        }),
      }
    );

    if (!res.ok) {
      toast({
        title: t('something_went_wrong'),
        description: res.statusText,
      });
      return;
    }

    const { id, title } = (await res.json()) as AIChat;
    if (id) {
      setCollapsed(true);
      setChat({ id, title, model: model.value, is_public: false });
      if (disableScrollToBottom && disableScrollToTop) return;
    }
  };

  const updateChat = async (newData: Partial<AIChat>) => {
    if (!chat?.id) return;

    const { is_public } = newData;
    const supabase = await createClient();

    const { error } = await supabase
      .from('ai_chats')
      .update({ is_public })
      .eq('id', chat?.id);

    if (error) {
      toast({
        title: t('something_went_wrong'),
        description: error.message,
      });
      return;
    }

    setChat({ ...chat, is_public });
    toast({
      title: t('chat_updated'),
      description: t('visibility_updated_desc'),
    });
  };

  useEffect(() => {
    if (!pendingPrompt || !chat?.id || !wsId) return;
    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: pendingPrompt }],
    });
    setPendingPrompt(null);
  }, [wsId, pendingPrompt, chat?.id, sendMessage]);

  useEffect(() => {
    if (!pathname.includes('/chat/') && messages.length === 1) {
      window.history.replaceState({}, '', `/${wsId}/chat/${chat?.id}`);
    }
  }, [wsId, chat?.id, pathname, messages]);

  return (
    <div className="@container relative h-full">
      <div className={cn('@md:pt-10', wsId ? 'pb-32' : 'pb-4', className)}>
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
        ) : disableScrollToTop && disableScrollToBottom ? (
          <h1 className="mb-2 flex h-full w-full items-center justify-center text-center font-semibold text-lg">
            {t('welcome_to')}{' '}
            <span className="ml-1 overflow-hidden bg-linear-to-r from-dynamic-red via-dynamic-purple to-dynamic-sky bg-clip-text font-bold text-transparent">
              Rewise
            </span>
            .
          </h1>
        ) : (
          <EmptyScreen
            wsId={wsId}
            chats={chats}
            setInput={setInput}
            locale={locale}
          />
        )}
      </div>

      {wsId && (
        <ChatPanel
          id={chat?.id}
          wsId={wsId}
          chat={chat}
          chats={chats}
          count={count}
          status={status}
          sendMessage={sendMessage}
          stop={stop}
          input={input}
          inputRef={inputRef}
          setInput={setInput}
          model={model}
          setModel={setModel}
          messages={messages}
          collapsed={collapsed}
          createChat={createChat}
          updateChat={updateChat}
          clearChat={clearChat}
          setCollapsed={setCollapsed}
          defaultRoute={`/${wsId}/chat`}
          disableScrollToTop={disableScrollToTop}
          disableScrollToBottom={disableScrollToBottom}
        />
      )}
    </div>
  );
}
