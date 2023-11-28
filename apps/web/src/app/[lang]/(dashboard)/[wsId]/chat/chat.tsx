'use client';

import { useChat } from 'ai/react';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';
import { Message } from 'ai';
import { useLocalStorage } from '@mantine/hooks';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ChatList } from '@/components/chat-list';
import { ChatScrollAnchor } from '@/components/chat-scroll-anchor';
import { EmptyScreen } from '@/components/empty-screen';
import { ChatPanel } from '@/components/chat-panel';
import { useRouter, useSearchParams } from 'next/navigation';
import { AIChat } from '@/types/primitives/ai-chat';
import useTranslation from 'next-translate/useTranslation';

export interface ChatProps extends React.ComponentProps<'div'> {
  defaultChat?: AIChat;
  wsId: string;
  initialMessages?: Message[];
  previousMessages?: Message[];
  chats: AIChat[];
  count: number | null;
  hasKey?: boolean;
  locale?: string;
}

const Chat = ({
  defaultChat,
  wsId,
  initialMessages,
  previousMessages,
  chats,
  count,
  className,
  hasKey,
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
    // on the server or the a preview token is set
    setPreviewTokenDialog(!hasKey && !previewToken);
  }, [hasKey, previewToken]);

  const [chat, setChat] = useState<AIChat | undefined>(defaultChat);

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      id: chat?.id,
      initialMessages,
      api: `/api/chat/ai`,
      body: {
        id: chat?.id,
        wsId,
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

  useEffect(() => {
    if (!chat || (!hasKey && !previewToken) || isLoading) return;
    if (messages[messages.length - 1]?.role !== 'user') return;

    // Reload the chat if the user sends a message
    // but the AI did not respond yet after 1 second
    const timeout = setTimeout(() => {
      reload();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [chat, hasKey, previewToken, isLoading, messages, reload]);

  useEffect(() => {
    if (!chat?.id) return;

    // if there is "input" in the query string, we will
    // use that as the input for the chat, then remove
    // it from the query string
    const input = searchParams.get('input');
    if (input) {
      setInput(input.toString());
      router.replace(`/${wsId}/chat/${chat.id}`);
    }
  }, [chat?.id, searchParams, router, setInput, wsId]);

  const [collapsed, setCollapsed] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [input, inputRef]);

  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const createChat = async (input: string) => {
    setPendingPrompt(input);

    const res = await fetch(`/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        message: input,
        previewToken,
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
    if (id) {
      setCollapsed(true);
      setChat({ id, title });
    }
  };

  const clearChat = () => {
    if (defaultChat?.id) return;
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

  return (
    <>
      <div className={cn('pb-32 pt-4 md:pt-10', className)}>
        {(chat && messages.length) || pendingPrompt ? (
          <>
            <ChatList
              title={chat?.title}
              titleLoading={!chat?.id}
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

      <ChatPanel
        id={chat?.id}
        chats={chats}
        count={count}
        isLoading={isLoading}
        stop={stop}
        append={append}
        reload={reload}
        input={input}
        inputRef={inputRef}
        setInput={setInput}
        messages={messages}
        collapsed={collapsed}
        createChat={createChat}
        clearChat={clearChat}
        setCollapsed={setCollapsed}
        defaultRoute={`/${wsId}/chat`}
      />

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
