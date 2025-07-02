'use client';

import { defaultModel, type Model, models } from '@tuturuuu/ai/models';
import { useChat } from '@tuturuuu/ai/react';
import type { Message } from '@tuturuuu/ai/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIChat } from '@tuturuuu/types/db';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { ChatList } from '@/components/chat-list';
import { ChatPanel } from '@/components/chat-panel';
import { ChatScrollAnchor } from '@/components/chat-scroll-anchor';
import { EmptyScreen } from '@/components/empty-screen';

export interface ChatProps extends React.ComponentProps<'div'> {
  defaultChat?: Partial<AIChat>;
  wsId?: string;
  initialMessages?: Message[];
  chats?: AIChat[];
  count?: number | null;
  hasKeys: { openAI: boolean; anthropic: boolean; google: boolean };
  locale: string;
  disableScrollToTop?: boolean;
  disableScrollToBottom?: boolean;
}

const Chat = ({
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
}: ChatProps) => {
  const t = useTranslations('ai_chat');

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [chat, setChat] = useState<Partial<AIChat> | undefined>(defaultChat);
  const [model, setModel] = useState<Model | undefined>(defaultModel);

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      id: chat?.id,
      initialMessages,
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
      body: {
        id: chat?.id,
        wsId,
        model: chat?.model || model?.value,
      },
      onResponse(response) {
        if (!response.ok)
          toast({
            title: t('something_went_wrong'),
            description: t('try_again_later'),
          });
      },
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
  }, [chat?.id, messages?.length, chat?.latest_summarized_message_id]);

  useEffect(() => {
    if (!chat || !hasKeys || isLoading) return;

    const generateSummary = async (messages: Message[] = []) => {
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
        `/api/ai/chat/${model.provider.toLowerCase()}/summary`,
        {
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
    if (
      wsId &&
      !isLoading &&
      !summary &&
      !chat.latest_summarized_message_id &&
      chat.latest_summarized_message_id !== messages[messages.length - 1]?.id &&
      messages[messages.length - 1]?.role !== 'user'
    )
      generateSummary(messages);

    if (messages[messages.length - 1]?.role !== 'user') return;

    // Reload the chat if the user sends a message
    // but the AI did not respond yet after 1 second
    const reloadTimeout = setTimeout(() => {
      if (!wsId || messages[messages.length - 1]?.role !== 'user') return;
      reload();
    }, 1000);

    return () => {
      clearTimeout(reloadTimeout);
    };
  }, [wsId, summary, chat, hasKeys, isLoading, messages, reload]);

  const [initialScroll, setInitialScroll] = useState(true);

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
    setInput,
    wsId,
    chats,
    count,
    initialScroll,
  ]);

  const [collapsed, setCollapsed] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [input, inputRef]);

  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const createChat = async (input: string) => {
    if (!model) return;

    setPendingPrompt(input);

    const res = await fetch(
      `/api/ai/chat/${model.provider.toLowerCase()}/new`,
      {
        method: 'POST',
        body: JSON.stringify({
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
      router.replace(`/${wsId}/chat?id=${id}`);
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

  const clearChat = () => {
    if (defaultChat?.id) return;
    setSummary(undefined);
    setChat(undefined);
    setCollapsed(true);
  };

  useEffect(() => {
    if (!pendingPrompt || !chat?.id || !wsId) return;
    append({
      id: chat?.id,
      content: pendingPrompt,
      role: 'user',
    });
    setPendingPrompt(null);
  }, [wsId, pendingPrompt, chat?.id, append]);

  useEffect(() => {
    console.log(pathname);
    if (!pathname.includes('/chat/') && messages.length === 1) {
      window.history.replaceState({}, '', `/${wsId}/chat/${chat?.id}`);
    }
  }, [chat?.id, pathname, messages]);

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
                        content: pendingPrompt,
                        role: 'user',
                      },
                    ]
                  : messages
              }
              setInput={setInput}
              locale={locale}
              model={chat?.model ?? undefined}
              anonymize={!chats || count === undefined}
            />
            <ChatScrollAnchor trackVisibility={isLoading} />
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
          isLoading={isLoading}
          stop={stop}
          append={append}
          reload={reload}
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
};

export default Chat;
