'use client';

import { ChatList } from '@/components/chat-list';
import { ChatPanel } from '@/components/chat-panel';
import { ChatScrollAnchor } from '@/components/chat-scroll-anchor';
import { EmptyScreen } from '@/components/empty-screen';
import { Model, defaultModel } from '@/data/models';
import { AIChat } from '@/types/db';
import { createClient } from '@/utils/supabase/client';
import { useChat } from '@ai-sdk/react';
import { useLocalStorage } from '@mantine/hooks';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { toast } from '@repo/ui/hooks/use-toast';
import { cn } from '@repo/ui/lib/utils';
import { Message } from 'ai';
import useTranslation from 'next-translate/useTranslation';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';

export interface ChatProps extends React.ComponentProps<'div'> {
  defaultChat?: Partial<AIChat>;
  wsId?: string;
  initialMessages?: Message[];
  previousMessages?: Message[];
  chats?: AIChat[];
  count?: number | null;
  hasKeys: { openAI: boolean; anthropic: boolean; google: boolean };
  locale: string;
}

const Chat = ({
  defaultChat,
  wsId,
  initialMessages,
  previousMessages,
  chats,
  count,
  className,
  hasKeys,
  locale,
}: ChatProps) => {
  const { t } = useTranslation('ai-chat');

  const router = useRouter();
  const searchParams = useSearchParams();

  const [previewToken, setPreviewToken] = useLocalStorage({
    key: 'ai-token',
    defaultValue: '',
  });

  const [previewTokenDialog, setPreviewTokenDialog] = useState(false);
  const [previewTokenInput, setPreviewTokenInput] = useState(previewToken);

  useEffect(() => {
    // Don't show the dialog if the key is configured
    // on the server or the preview token is set
    setPreviewTokenDialog(!hasKeys && !previewToken);
  }, [hasKeys, previewToken]);

  const [chat, setChat] = useState<Partial<AIChat> | undefined>(defaultChat);
  const [model, setModel] = useState<Model | undefined>(defaultModel);

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      id: chat?.id,
      initialMessages,
      api: model ? `/api/ai/chat/${model.provider.toLowerCase()}` : undefined,
      body: {
        id: chat?.id,
        wsId,
        model: chat?.model || model?.value,
        previewToken,
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

  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | undefined>(
    chat?.summary || ''
  );

  useEffect(() => {
    setSummary(chat?.summary || '');
    setSummarizing(false);
  }, [chat?.id, messages?.length, chat?.latest_summarized_message_id]);

  useEffect(() => {
    if (!chat || (!hasKeys && !previewToken) || isLoading) return;

    const generateSummary = async (messages: Message[] = []) => {
      if (
        !wsId ||
        summarizing ||
        !model ||
        !chat?.id ||
        !chat?.model ||
        !messages?.length ||
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
            previewToken,
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
  }, [wsId, chat, hasKeys, previewToken, isLoading, messages, reload]);

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
      window.scrollTo({
        top: chat?.id ? document.body.scrollHeight : 0,
        behavior: 'smooth',
      });
    }

    if (chat?.id && input) {
      setInput(input.toString());
      router.replace(`/${wsId}/chat/${chat.id}`);
    }

    if (refresh) {
      clearChat();
      router.replace(`/${wsId}/chat?`);
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
          previewToken,
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
      router.replace(`/${wsId}/chat?id=${id}`);
    }
  };

  const updateChat = async (newData: Partial<AIChat>) => {
    if (!chat?.id) return;

    const { is_public } = newData;
    const supabase = createClient();

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

  return (
    <>
      <div className={cn('pt-4 md:pt-10', wsId ? 'pb-32' : 'pb-4', className)}>
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
                  : messages.map((message) => {
                      // If there is 2 repeated substring in the
                      // message, we will merge them into one
                      const content = message.content;
                      const contentLength = content.length;
                      const contentHalfLength = Math.floor(contentLength / 2);

                      const firstHalf = content.substring(0, contentHalfLength);

                      const secondHalf = content.substring(
                        contentHalfLength,
                        contentLength
                      );

                      if (firstHalf === secondHalf) message.content = firstHalf;
                      return message;
                    })
              }
              setInput={setInput}
              locale={locale}
              model={chat?.model ?? undefined}
              anonymize={!chats || count === undefined}
            />
            <ChatScrollAnchor trackVisibility={isLoading} />
          </>
        ) : (
          <EmptyScreen
            wsId={wsId}
            chats={chats}
            count={count}
            setInput={setInput}
            previousMessages={previousMessages}
            locale={locale}
          />
        )}
      </div>

      {chats && count !== undefined && (
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
          model={model}
          setModel={setModel}
          messages={messages}
          collapsed={collapsed}
          createChat={createChat}
          updateChat={updateChat}
          clearChat={clearChat}
          setCollapsed={setCollapsed}
          defaultRoute={`/${wsId}/chat`}
        />
      )}

      <Dialog open={previewTokenDialog} onOpenChange={setPreviewTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter your Anthropic Key</DialogTitle>
            <DialogDescription>
              If you have not obtained your Anthropic API key, you can do so by{' '}
              <a
                href="https://console.anthropic.com/account/keys"
                className="underline"
              >
                generating an API key
              </a>{' '}
              on the Anthropic website. This is only necessary for preview
              environments so that the open source community can test the app.
              The token will be saved to your browser&apos;s local storage under
              the name <code className="font-mono">ai-token</code>.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={previewTokenInput}
            placeholder="Anthropic API key"
            onChange={(e) => setPreviewTokenInput(e.target.value)}
          />
          <DialogFooter className="items-center">
            <Button
              onClick={() => {
                setPreviewToken(previewTokenInput);
                setPreviewTokenDialog(false);
              }}
            >
              Save Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Chat;
