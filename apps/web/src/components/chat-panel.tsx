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
  ArrowDownToLine,
  Bolt,
  Check,
  CheckCheck,
  ExternalLink,
  FolderOpen,
  Globe,
  LinkIcon,
  Lock,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

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
  chats?: AIChat[];
  count?: number | null;
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
  const t = useTranslations('ai_chat');

  const [updating, setUpdating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [showChatVisibility, setShowChatVisibility] = useState(false);
  const [showExtraOptions, setShowExtraOptions] = useState(false);

  const disablePublicLink = isLoading || updating || !id || !chat?.is_public;

  const [chatInputHeight, setChatInputHeight] = useState(0);

  useEffect(() => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) setChatInputHeight(chatInput.clientHeight);
  }, [input]);

  return (
    <Dialog open={showChatVisibility} onOpenChange={setShowChatVisibility}>
      <div className="to-muted/50 fixed inset-x-0 bottom-0 bg-gradient-to-b from-transparent">
        <div
          className={cn(
            'absolute z-10 flex items-end gap-2 md:flex-col',
            !!chats ? 'right-2 md:right-6 xl:right-8' : 'right-2 md:right-4'
          )}
          style={{
            bottom: chatInputHeight ? chatInputHeight + 4 : '1rem',
          }}
        >
          <ScrollToTopButton />
          <ScrollToBottomButton />

          {!!chats && count !== undefined && id && (
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
                  <ArrowDownToLine className="h-5 w-5" />
                )}
              </Button>
            </div>
          )}
        </div>

        {!!chats && count !== undefined && (
          <div
            id="chat-input"
            className="mx-auto flex flex-col gap-2 md:px-4 lg:max-w-4xl xl:max-w-6xl"
          >
            <div className="relative flex items-center justify-center gap-2">
              <div
                id="chat-sidebar"
                className={`absolute -bottom-1 z-20 w-full rounded-lg border-t p-2 transition-all duration-500 md:border ${
                  collapsed
                    ? 'pointer-events-none border-transparent bg-transparent'
                    : 'border-border bg-background shadow-lg'
                }`}
              >
                <div
                  className={`transition duration-300 ${
                    collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
                  }`}
                >
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
                    <ScrollArea className="h-96">
                      <div className="grid w-full grid-cols-1 items-center justify-center gap-1 overflow-hidden md:grid-cols-2 lg:grid-cols-3">
                        {chats.length > 0 ? (
                          chats.map((chat) =>
                            chat.id === id ? (
                              <Button
                                key={chat.id}
                                variant="secondary"
                                className="inline-block w-full"
                                disabled
                              >
                                <div className="max-w-full truncate">
                                  {chat?.title || chat.id}
                                </div>
                              </Button>
                            ) : (
                              <Link
                                key={chat.id}
                                href={`${defaultRoute}/${chat.id}`}
                                className="w-full"
                              >
                                <Button
                                  variant="secondary"
                                  className="inline-block w-full"
                                  disabled={collapsed}
                                >
                                  <div className="max-w-full truncate">
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
                    </ScrollArea>
                    <Separator className="my-2" />
                    <div className="flex flex-row-reverse gap-2 lg:flex-row">
                      <Button
                        size="icon"
                        variant="secondary"
                        className={`flex-none ${
                          collapsed
                            ? 'pointer-events-none opacity-0'
                            : 'opacity-100'
                        } transition duration-300`}
                        onClick={() => setCollapsed(true)}
                      >
                        <ArrowDownToLine className="h-5 w-5" />
                      </Button>
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
                  </div>
                </div>
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
                    ? 'pointer-events-auto mb-2 opacity-100'
                    : 'pointer-events-none h-0 p-0 opacity-0'
                } transition-all ease-in-out`}
                setOpen={setShowExtraOptions}
                onChange={setModel}
              />
              <div className="flex w-full items-center">
                <PromptForm
                  chat={chat}
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
                          ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                          : 'pointer-events-auto ml-2 w-10 opacity-100'
                      )}
                      disabled={!id}
                      onClick={() => setShowChatVisibility((prev) => !prev)}
                    >
                      {chat?.is_public ? <Globe /> : <Lock />}
                      <span className="sr-only">{t('chat_visibility')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('chat_visibility')}</TooltipContent>
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
                          ? 'pointer-events-none w-0 bg-transparent text-transparent opacity-0'
                          : 'pointer-events-auto ml-2 w-10 opacity-100'
                      )}
                      disabled={isLoading || showExtraOptions}
                    >
                      <Bolt />
                      <span className="sr-only">{t('extra_options')}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('extra_options')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>

      <DialogContent>
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
              disabled={!id || chat?.is_public}
            >
              {chat?.is_public ? (
                <Check className="mr-2 h-4 w-4" />
              ) : updating ? (
                <LoadingIndicator className="mr-2 h-4 w-4" />
              ) : (
                <Globe className="mr-2 h-4 w-4" />
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
              disabled={!id || !chat?.is_public}
            >
              {!chat?.is_public ? (
                <Check className="mr-2 h-4 w-4" />
              ) : updating ? (
                <LoadingIndicator className="mr-2 h-4 w-4" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              <div className="line-clamp-1">{t('only_me')}</div>
            </Button>
          </div>

          <Separator className="mb-2 mt-4" />

          <Button
            variant="outline"
            className="mt-2 w-full"
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
              <CheckCheck className="mr-2 h-4 w-4" />
            ) : (
              <LinkIcon className="mr-2 h-4 w-4" />
            )}
            {t('copy_public_link')}
          </Button>
          <Button
            className="mt-2 w-full"
            onClick={() =>
              window.open(`${window.location.origin}/ai/chats/${id}`)
            }
            disabled={disablePublicLink}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('open_public_link')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
