import { ChatModelSelector } from './chat-model-selector';
import { ScrollToTopButton } from './scroll-to-top-button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { PromptForm } from '@/components/prompt-form';
import { ScrollToBottomButton } from '@/components/scroll-to-bottom-button';
import { Button } from '@/components/ui/button';
import { Model } from '@/data/models';
import { AIChat } from '@/types/primitives/ai-chat';
import { Message } from 'ai';
import { type UseChatHelpers } from 'ai/react';
import {
  ArrowDownFromLine,
  ArrowLeftToLine,
  ArrowUpFromLine,
  FolderOpen,
} from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import React, { useState } from 'react';

export interface ChatPanelProps
  extends Pick<
    UseChatHelpers,
    | 'append'
    | 'isLoading'
    | 'reload'
    | 'messages'
    | 'stop'
    | 'input'
    | 'setInput'
  > {
  id?: string;
  chats: AIChat[];
  count: number | null;
  defaultRoute: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  model: Model;
  setModel: (model: Model) => void;
  createChat: (input: string) => Promise<void>;
  clearChat: () => void;
  initialMessages?: Message[];
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function ChatPanel({
  id,
  chats,
  count,
  defaultRoute,
  isLoading,
  append,
  input,
  inputRef,
  setInput,
  model,
  setModel,
  createChat,
  clearChat,
  collapsed,
  setCollapsed,
}: ChatPanelProps) {
  const { t } = useTranslation('ai-chat');

  const [showExtraOptions, setShowExtraOptions] = useState(false);

  return (
    <div className="to-muted/50 fixed inset-x-0 bottom-0 bg-gradient-to-b from-transparent">
      <div className="absolute bottom-20 right-4 z-10 grid gap-2 md:bottom-28 md:right-8">
        <ScrollToTopButton />
        <ScrollToBottomButton />
      </div>

      <div className="mx-auto sm:px-4 lg:max-w-4xl xl:max-w-6xl">
        <div className="relative mb-2 flex items-center justify-center gap-2">
          <div
            id="chat-sidebar"
            className={`absolute -bottom-2 z-20 w-full rounded-lg border-t p-2 transition-all duration-500 md:border ${
              collapsed
                ? 'pointer-events-none border-transparent bg-transparent'
                : 'border-border bg-background shadow-lg md:bottom-0'
            }`}
          >
            <div
              className={`transition duration-300 ${
                collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
              }`}
            >
              <ScrollArea className="h-96">
                <div className="text-center">
                  <div className="text-foreground font-semibold">
                    {t('chats')}
                    {count ? (
                      <span className="opacity-50"> ({count})</span>
                    ) : (
                      ''
                    )}
                  </div>
                  <Separator className="my-2" />
                  <div className="grid gap-1">
                    {chats.length > 0 ? (
                      chats.map((chat) =>
                        chat.id === id ? (
                          <Button
                            key={chat.id}
                            variant="secondary"
                            className="w-full"
                            disabled
                          >
                            <div className="line-clamp-1">
                              {chat?.title || chat.id}
                            </div>
                          </Button>
                        ) : (
                          <Link
                            key={chat.id}
                            href={`${defaultRoute}/${chat.id}`}
                          >
                            <Button
                              variant="secondary"
                              className="w-full"
                              disabled={collapsed}
                            >
                              <div className="line-clamp-1">
                                {chat?.title || chat.id}
                              </div>
                            </Button>
                          </Link>
                        )
                      )
                    ) : (
                      <div className="text-foreground/60 mt-8 p-8">
                        {t('no_chats')}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
              <Separator className="my-2" />
            </div>

            {id && (
              <div className="flex w-full gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="bg-background/20 pointer-events-auto flex-none backdrop-blur-lg"
                  onClick={() => setCollapsed(!collapsed)}
                >
                  {collapsed ? (
                    <FolderOpen className="h-5 w-5" />
                  ) : (
                    <ArrowLeftToLine className="h-5 w-5" />
                  )}
                </Button>

                {/* <Button
                  size="icon"
                  variant="outline"
                  className="bg-background/20 pointer-events-auto flex-none backdrop-blur-lg"
                  disabled
                >
                  <Settings className="h-5 w-5" />
                </Button> */}

                <Link
                  href={defaultRoute}
                  className={`w-full ${
                    collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
                  } ${id ? '' : 'cursor-default'} transition duration-300`}
                  onClick={clearChat}
                >
                  <Button className="w-full" disabled={!id || collapsed}>
                    <div className="line-clamp-1">{t('new_chat')}</div>
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* {isLoading ? (
            <Button
              variant="outline"
              onClick={() => stop()}
              className="bg-background/20"
            >
              <IconStop className="mr-2" />
              {t('stop_generating')}
            </Button>
          ) : messages?.length > 0 ? (
            <Button
              variant="outline"
              onClick={() => reload()}
              className="bg-background/20"
            >
              <IconRefresh className="mr-2" />
              {t('regenerate_response')}
            </Button>
          ) : null} */}
        </div>

        <div
          className={`bg-background/20 flex flex-col items-start justify-end space-y-2 rounded-t-xl border border-t p-2 shadow-lg backdrop-blur-lg ${
            showExtraOptions ? 'h-[7.75rem]' : 'h-20'
          } transition-all duration-500`}
        >
          <ChatModelSelector
            className={`${
              showExtraOptions
                ? 'pointer-events-auto opacity-100 delay-500 duration-500'
                : 'pointer-events-none opacity-0'
            } transition-all ease-in-out`}
            model={model}
            onChange={(m) => {
              setModel(m);
              console.log(m);
            }}
          />
          <div className="flex w-full items-center gap-2">
            <PromptForm
              onSubmit={async (value) => {
                // If there is no id, create a new chat
                if (!id) return await createChat(value);

                // If there is an id, append the message to the chat
                await append({
                  id,
                  content: value,
                  role: 'user',
                });
              }}
              input={input}
              inputRef={inputRef}
              setInput={setInput}
              isLoading={isLoading}
            />
            <Button
              size="icon"
              type="submit"
              variant="ghost"
              onClick={() => setShowExtraOptions((prev) => !prev)}
            >
              {showExtraOptions ? <ArrowDownFromLine /> : <ArrowUpFromLine />}
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
