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
import { ArrowLeftToLine, FolderOpen } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';

export interface ChatProps extends React.ComponentProps<'div'> {
  id?: string;
  wsId: string;
  initialMessages?: Message[];
  hasKey?: boolean;
}

const Chat = ({ id, wsId, initialMessages, className, hasKey }: ChatProps) => {
  const { t } = useTranslation('ai-chat');
  const router = useRouter();

  const [previewToken, setPreviewToken] = useLocalStorage({
    key: 'ai-token',
    defaultValue: '',
  });

  const [previewTokenDialog, setPreviewTokenDialog] = useState(false);
  const [previewTokenInput, setPreviewTokenInput] = useState(previewToken);

  useEffect(() => {
    // Don't show the dialog if the key is configured
    // on the server or the a preview token is set
    if (hasKey || previewToken) return;
    setPreviewTokenDialog(true);
  }, [previewToken, hasKey]);

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      id,
      initialMessages,
      api: '/api/chat/ai',
      body: {
        id,
        wsId,
        previewToken,
      },
      onResponse(response) {
        if (response.status === 401) {
          toast({
            title: 'Something went wrong',
            description: response.statusText,
          });
        }
      },
    });

  const [collapsed, setCollapsed] = useState(true);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const updateInput = (input: string) => {
    setInput(input);
    if (inputRef.current) inputRef.current.focus();
  };

  const createChat = async (input: string) => {
    const res = await fetch(`/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        message: input,
      }),
    });

    if (!res.ok) {
      toast({
        title: 'Something went wrong',
        description: res.statusText,
      });
      return;
    }

    const { id } = await res.json();
    if (id) router.push(`/${wsId}/chat/${id}`);
  };

  return (
    <>
      <div className="relative flex">
        <div
          id="chat-sidebar"
          className={`bg-background static z-10 w-full rounded-lg border transition-all duration-500 md:absolute md:max-w-xs ${
            collapsed
              ? 'border-transparent bg-transparent'
              : 'border-foreground/5 p-2'
          }`}
        >
          <div className="flex w-full gap-2">
            <Button
              size="icon"
              className={`flex-none ${
                collapsed ? 'transition hover:opacity-100' : ''
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
                collapsed
                  ? 'pointer-events-none hidden opacity-0 disabled:opacity-0 md:block'
                  : 'opacity-100'
              }`}
              disabled={collapsed}
            >
              <div className="line-clamp-1">{t('new_chat')}</div>
            </Button>
          </div>

          <div
            className={`transition duration-300 ${
              collapsed
                ? 'pointer-events-none hidden opacity-0 md:block'
                : 'opacity-100'
            }`}
          >
            <Separator className="my-2" />
            <Button className="w-full" disabled={collapsed}>
              {t('default_chat')}
            </Button>
          </div>
        </div>
      </div>

      <div className={cn('pb-32 pt-4 md:pt-10', className)}>
        {id && messages.length ? (
          <>
            <ChatList
              messages={messages.map((message) => {
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
              })}
            />
            <ChatScrollAnchor trackVisibility={isLoading} />
          </>
        ) : (
          <EmptyScreen setInput={updateInput} />
        )}
      </div>

      <ChatPanel
        id={id}
        isLoading={isLoading}
        stop={stop}
        append={append}
        reload={reload}
        messages={messages}
        input={input}
        inputRef={inputRef}
        setInput={setInput}
        createChat={createChat}
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
