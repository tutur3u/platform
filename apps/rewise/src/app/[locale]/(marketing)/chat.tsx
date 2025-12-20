'use client';

import { DefaultChatTransport } from '@tuturuuu/ai/core';
import { defaultModel, type Model, models } from '@tuturuuu/ai/models';
import { useChat } from '@tuturuuu/ai/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIChat } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
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
  inputModel?: Model;
  defaultChat?: Partial<AIChat>;
  initialMessages?: UIMessage[];
  chats?: AIChat[];
  count?: number | null;
  locale: string;
  noEmptyPage?: boolean;
  disabled?: boolean;
}

export default function Chat({
  inputModel = defaultModel,
  defaultChat,
  initialMessages,
  chats,
  count,
  className,
  locale,
  noEmptyPage,
  disabled,
}: ChatProps) {
  const t = useTranslations();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [chat, setChat] = useState<Partial<AIChat> | undefined>(defaultChat);
  const [model, setModel] = useState<Model | undefined>(inputModel);
  const [currentUserId, setCurrentUserId] = useState<string>();
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
            )?.replace(' ', '-')}`
          : undefined,
      credentials: 'include',
      headers: { 'Custom-Header': 'value' },
      body: {
        // DO NOT PUT ID HERE AS IT WILL BE OVERRIDDEN BY chatId IN useChat
        model: chat?.model || model?.value,
        wsId: ROOT_WORKSPACE_ID,
      },
    }),
    onError() {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: t('ai_chat.try_again_later'),
      });
    },
  });

  useEffect(() => {
    const getCurrentUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };

    getCurrentUser();
  }, []);

  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | undefined>(
    chat?.summary || ''
  );

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
          title: t('ai_chat.something_went_wrong'),
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
      status === 'ready' &&
      !summary &&
      !chat.latest_summarized_message_id &&
      chat.latest_summarized_message_id !== lastMessage?.id &&
      lastMessage?.role !== 'user'
    )
      generateSummary(messages);
  }, [chat, messages, model, status, summarizing, summary, t]);

  const [initialScroll, setInitialScroll] = useState(true);

  const clearChat = useCallback(() => {
    if (chat?.id) return;
    setSummary(undefined);
    setChat(undefined);
    setCollapsed(true);
  }, [chat?.id]);

  useEffect(() => {
    // if there is "input" in the query string, we will
    // use that as the input for the chat, then remove
    // it from the query string
    const input = searchParams.get('ai_chat.input');
    const refresh = searchParams.get('ai_chat.refresh');

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
    }

    if (refresh) {
      clearChat();
      router.replace('/');
      router.refresh();
    }
  }, [chat?.id, searchParams, router, chats, count, initialScroll, clearChat]);

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
        title: t('ai_chat.something_went_wrong'),
        description: res.statusText,
      });
      return;
    }

    const { id, title } = (await res.json()) as AIChat;
    if (id) {
      setCollapsed(true);
      setChat({ id, title, model: model.value, is_public: false });
    }
  };

  const updateChat = async (newData: Partial<AIChat>) => {
    if (!chat?.id) return;

    const supabase = createClient();

    const { error } = await supabase
      .from('ai_chats')
      .update(newData)
      .eq('id', chat?.id);

    if (error) {
      toast({
        title: t('ai_chat.something_went_wrong'),
        description: error.message,
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
      window.history.replaceState({}, '', `/c/${chat?.id}`);
    }
  }, [chat?.id, pathname, messages]);

  return (
    <div className="relative">
      <div className={cn('min-h-[calc(100vh-8rem)] pb-32 md:pt-10', className)}>
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
          <div className="flex h-[calc(100vh-20rem)] w-full items-center justify-center font-bold text-2xl lg:text-4xl xl:text-5xl">
            {t('common.coming_soon')} ✨
          </div>
        ) : (
          <EmptyScreen chats={chats} setInput={setInput} locale={locale} />
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
        model={
          chat?.model
            ? models.find((m) => m.value === chat.model) || model
            : model
        }
        setModel={setModel}
        messages={messages}
        collapsed={collapsed}
        createChat={createChat}
        updateChat={updateChat}
        clearChat={clearChat}
        setCollapsed={setCollapsed}
        disabled={disabled}
        currentUserId={currentUserId}
        wsId={ROOT_WORKSPACE_ID}
      />
    </div>
  );
}
