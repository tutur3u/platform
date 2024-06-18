import { ChatModelSelector } from './chat-model-selector';
import LoadingIndicator from './common/LoadingIndicator';
import { PromptForm } from './prompt-form';
import { ScrollToBottomButton } from './scroll-to-bottom-button';
import { ScrollToTopButton } from './scroll-to-top-button';
import { Model } from '@/data/models';
import { AIChat } from '@/types/db';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { cn } from '@repo/ui/lib/utils';
import { Message } from 'ai';
import { type UseChatHelpers } from 'ai/react';
import {
  ArrowLeftToLine,
  Bolt,
  Check,
  CheckCheck,
  ExternalLink,
  FolderOpen,
  Globe,
  LinkIcon,
  Lock,
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
  chat: Partial<AIChat> | undefined;
  chats: AIChat[];
  count: number | null;
  defaultRoute: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  model?: Model;
  setModel: (model: Model) => void;
  createChat: (input: string) => Promise<void>;
  updateChat: (data: Partial<AIChat>) => Promise<void>;
  clearChat: () => void;
  initialMessages?: Message[];
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function ChatPanel({
  id,
  chat,
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
  updateChat,
  clearChat,
  collapsed,
  setCollapsed,
}: ChatPanelProps) {
  const { t } = useTranslation('ai-chat');

  const [updating, setUpdating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [showChatVisibility, setShowChatVisibility] = useState(false);
  const [showExtraOptions, setShowExtraOptions] = useState(false);

  const disablePublicLink = isLoading || updating || !id || !chat?.is_public;

  return (
    <Dialog open={showChatVisibility} onOpenChange={setShowChatVisibility}>
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
                      collapsed
                        ? 'pointer-events-none opacity-0'
                        : 'opacity-100'
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
            className={`bg-background/20 flex flex-col items-start justify-end rounded-t-xl border border-t p-2 shadow-lg backdrop-blur-lg transition-all`}
          >
            <ChatModelSelector
              open={showExtraOptions}
              model={model}
              className={`${
                showExtraOptions
                  ? 'pointer-events-auto opacity-100 mb-2'
                  : 'pointer-events-none opacity-0 h-0 p-0'
              } transition-all ease-in-out`}
              setOpen={setShowExtraOptions}
              onChange={setModel}
            />
            <div className="flex w-full items-center">
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

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      'transition duration-300',
                      !id
                        ? 'opacity-0 bg-transparent w-0 text-transparent pointer-events-none'
                        : 'ml-2 opacity-100 pointer-events-auto w-10'
                    )}
                    disabled={isLoading || !id}
                    onClick={() => setShowChatVisibility((prev) => !prev)}
                  >
                    {chat?.is_public ? <Globe /> : <Lock />}
                    <span className="sr-only">Chat visibility</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Chat visibility</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    type="submit"
                    variant="ghost"
                    onClick={() => setShowExtraOptions((prev) => !prev)}
                    className={cn(
                      'transition-all duration-300',
                      id
                        ? 'opacity-0 bg-transparent w-0 text-transparent pointer-events-none'
                        : 'ml-2 opacity-100 pointer-events-auto w-10'
                    )}
                    disabled={isLoading || showExtraOptions}
                  >
                    <Bolt />
                    <span className="sr-only">Extra options</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Extra options</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      <DialogContent>
        {/* Ask if the user really want to set the chat to public/private */}
        <div className="text-center">
          <DialogHeader>
            <DialogTitle>{t('chat_visibility')}</DialogTitle>
            <DialogDescription>
              {t('chat_visibility_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                setUpdating(true);
                await updateChat({ is_public: true });
                setCopiedLink(false);
                setUpdating(false);
              }}
              disabled={isLoading || updating || !id || chat?.is_public}
            >
              {chat?.is_public ? (
                <Check className="w-4 h-4 mr-2" />
              ) : updating ? (
                <LoadingIndicator className="w-4 h-4 mr-2" />
              ) : (
                <Globe className="w-4 h-4 mr-2" />
              )}
              <div className="line-clamp-1">{t('public')}</div>
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                setUpdating(true);
                await updateChat({ is_public: false });
                setCopiedLink(false);
                setUpdating(false);
              }}
              disabled={isLoading || updating || !id || !chat?.is_public}
            >
              {!chat?.is_public ? (
                <Check className="w-4 h-4 mr-2" />
              ) : updating ? (
                <LoadingIndicator className="w-4 h-4 mr-2" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              <div className="line-clamp-1">{t('only_me')}</div>
            </Button>
          </div>

          <Separator className="mt-4 mb-2" />

          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/ai/chats/${id}`
              );
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            disabled={disablePublicLink || copiedLink}
          >
            {copiedLink ? (
              <CheckCheck className="w-4 h-4 mr-2" />
            ) : (
              <LinkIcon className="w-4 h-4 mr-2" />
            )}
            {t('copy_public_link')}
          </Button>
          <Button
            className="w-full mt-2"
            onClick={() =>
              window.open(`${window.location.origin}/ai/chats/${id}`)
            }
            disabled={disablePublicLink}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {t('open_public_link')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
