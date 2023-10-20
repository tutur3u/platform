'use client';

import { useChat } from 'ai/react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Message } from 'ai';
import { useLocalStorage } from '@mantine/hooks';
import { VERCEL_PREVIEW_MODE } from '@/constants/common';
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

export interface ChatProps extends React.ComponentProps<'div'> {
  id?: string;
  initialMessages?: Message[];
}

const Chat = ({ id, initialMessages, className }: ChatProps) => {
  // const { t } = useTranslation('ai-chat');

  const [previewToken, setPreviewToken] = useLocalStorage({
    key: 'ai-token',
    defaultValue: '',
  });

  const [previewTokenDialog, setPreviewTokenDialog] =
    useState(VERCEL_PREVIEW_MODE);

  const [previewTokenInput, setPreviewTokenInput] = useState(
    previewToken ?? ''
  );

  const { messages, append, reload, stop, isLoading, input, setInput } =
    useChat({
      initialMessages,
      id,
      body: {
        id,
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

  // const [collapsed, setCollapsed] = useState(true);

  return (
    <>
      {/* <div className="relative flex">
        <div
          id="chat-sidebar"
          className={`absolute w-full max-w-xs rounded-lg border transition-all duration-500 ${
            collapsed ? 'border-transparent' : 'border-foreground/5 p-2'
          }`}
        >
          <div className="flex w-full gap-2">
            <Button
              size="icon"
              className={`flex-none ${
                collapsed ? 'opacity-50 transition hover:opacity-100' : ''
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
                collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
              }`}
              disabled={!collapsed}
            >
              <div className="line-clamp-1">{t('new_chat')}</div>
            </Button>
          </div>

          <div
            className={`transition duration-300 ${
              collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
          >
            <Separator className="my-2" />
            <Button className="w-full" disabled>
              {t('default_chat')}
            </Button>
          </div>
        </div>
      </div> */}

      <div className={cn('pb-[200px] pt-4 md:pt-10', className)}>
        {messages.length ? (
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
          <EmptyScreen setInput={setInput} />
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
        setInput={setInput}
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
