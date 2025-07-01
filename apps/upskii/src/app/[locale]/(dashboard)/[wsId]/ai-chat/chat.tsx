'use client';

import { defaultModel, type Model, models } from '@tuturuuu/ai/models';
import { useChat } from '@tuturuuu/ai/react';
import type { Message } from '@tuturuuu/ai/types';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIChat } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
  inputModel?: Model;
  defaultChat?: Partial<AIChat>;
  initialMessages?: Message[];
  chats?: AIChat[];
  count?: number | null;
  locale: string;
  noEmptyPage?: boolean;
  disabled?: boolean;
  initialApiKey?: string | null;
  user: WorkspaceUser;
  wsId: string;
}

const Chat = ({
  inputModel = defaultModel,
  defaultChat,
  initialMessages,
  chats,
  count,
  className,
  locale,
  noEmptyPage,
  disabled,
  initialApiKey,
  user,
  wsId,
}: ChatProps) => {
  const t = useTranslations();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentUserId = user.id;

  
  const [chat, setChat] = useState<Partial<AIChat> | undefined>(defaultChat);
  const [model, setModel] = useState<Model | undefined>(inputModel);

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      id: chat?.id,
      initialMessages,
      credentials: 'include',
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
      body: {
        id: chat?.id,
        model: chat?.model || model?.value,
        wsId: wsId,
      },
      onResponse(response) {
        console.log('Response:', response);
        if (!response.ok) {
          toast({
            title: t('ai_chat.something_went_wrong'),
            description: t('ai_chat.try_again_later'),
          });
        }
      },
      onError(error) {
        console.log('Chat Error', error);
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

  useEffect(() => {
    setSummary(chat?.summary || '');
    setSummarizing(false);
  }, [chat?.id, messages?.length, chat?.latest_summarized_message_id]);

  useEffect(() => {
    if (!chat || isLoading) return;

    const generateSummary = async (messages: Message[] = []) => {
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
            wsId: wsId,
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
    if (
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
      if (messages[messages.length - 1]?.role !== 'user') return;
      reload();
    }, 1000);

    return () => {
      clearTimeout(reloadTimeout);
    };
  }, [summary, chat, isLoading, messages, reload]);

  const [initialScroll, setInitialScroll] = useState(true);

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
  }, [chat?.id, searchParams, router, setInput, chats, count, initialScroll]);

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
      `/api/ai/chat/${model.provider.toLowerCase().replace(' ', '-')}/new`,
      {
        credentials: 'include',
        method: 'POST',
        body: JSON.stringify({
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
      router.refresh();
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

  const clearChat = () => {
    if (defaultChat?.id) return;
    setSummary(undefined);
    setChat(undefined);
    setCollapsed(true);
  };

  useEffect(() => {
    if (!pendingPrompt || !chat?.id) return;
    append({
      id: chat?.id,
      content: pendingPrompt,
      role: 'user',
    });
    setPendingPrompt(null);
  }, [pendingPrompt, chat?.id, append]);

  useEffect(() => {
    if (!pathname.includes('/c/') && messages.length === 1 && chat?.id) {
      const basePath = pathname.split('/ai-chat')[0]; // Extract the base path before "/ai-chat"
      window.history.replaceState({}, '', `${basePath}/c/${chat.id}`);
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
        ) : noEmptyPage ? (
          <div className="flex h-[calc(100vh-20rem)] w-full items-center justify-center text-2xl font-bold lg:text-4xl xl:text-5xl">
            {t('common.coming_soon')} ✨
          </div>
        ) : (
          <EmptyScreen
            chats={chats}
            setInput={setInput}
            locale={locale}
            hasApiKey={!!initialApiKey}
          />
        )}
      </div>

      <ChatPanel
        id={chat?.id}
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
        apiKey={initialApiKey ?? undefined}
        wsId={wsId}
      />
    </div>
  );
};

export default Chat;
