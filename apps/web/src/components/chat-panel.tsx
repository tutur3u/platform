import { type UseChatHelpers } from 'ai/react';

import { Button } from '@/components/ui/button';
import { PromptForm } from '@/components/prompt-form';
import { ButtonScrollToBottom } from '@/components/button-scroll-to-bottom';
import { Separator } from './ui/separator';
import Link from 'next/link';
import { ArrowLeftToLine, FolderOpen, Globe2, Sparkles } from 'lucide-react';
import { AIChat } from '@/types/primitives/ai-chat';
import useTranslation from 'next-translate/useTranslation';
import { ScrollArea } from './ui/scroll-area';
import { Message } from 'ai';

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
  defaultRoute: string;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  createChat: (input: string) => Promise<void>;
  initialMessages?: Message[];
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  edge?: boolean;
  setUseEdge: (edge: boolean) => void;
}

export function ChatPanel({
  id,
  chats,
  defaultRoute,
  isLoading,
  append,
  input,
  inputRef,
  setInput,
  createChat,
  messages,
  collapsed,
  setCollapsed,
  edge,
  setUseEdge,
}: ChatPanelProps) {
  const { t } = useTranslation('ai-chat');

  return (
    <div className="to-muted/50 fixed inset-x-0 bottom-0 bg-gradient-to-b from-transparent">
      <div
        id="chat-sidebar"
        className={`bg-background absolute inset-x-2 bottom-[4.5rem] z-20 rounded-lg border p-2 transition-all duration-500 md:inset-x-6 md:bottom-[6.25rem] md:max-w-xs ${
          collapsed
            ? 'pointer-events-none border-transparent bg-transparent'
            : 'border-border shadow-lg'
        }`}
      >
        <div
          className={`transition duration-300 ${
            collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <ScrollArea className="h-96">
            <div className="text-center">
              <div className="text-foreground font-semibold">{t('chats')}</div>
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
                      <Link key={chat.id} href={`${defaultRoute}/${chat.id}`}>
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

        <div className="flex w-full gap-2">
          <Button
            size="icon"
            variant="outline"
            className="pointer-events-auto flex-none"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <FolderOpen className="h-5 w-5" />
            ) : (
              <ArrowLeftToLine className="h-5 w-5" />
            )}
          </Button>

          <Link
            href={defaultRoute}
            className={`w-full ${
              collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
            } ${id ? '' : 'cursor-default'} transition duration-300`}
          >
            <Button className="w-full" disabled={!id || collapsed}>
              <div className="line-clamp-1">{t('new_chat')}</div>
            </Button>
          </Link>
        </div>
      </div>

      <ButtonScrollToBottom />

      <div className="mx-auto sm:max-w-4xl sm:px-4">
        {id && (
          <div className="mb-2 flex h-10 flex-col items-center justify-center gap-2 md:flex-row">
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

            {edge ? (
              <Button
                variant="outline"
                onClick={() => setUseEdge(false)}
                className="bg-background/20 backdrop-blur-lg"
              >
                <Sparkles className="mr-2" />
                {t('use_edge')}
              </Button>
            ) : messages?.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => setUseEdge(true)}
                className="bg-background/20 backdrop-blur-lg"
              >
                <Globe2 className="mr-2" />
                {t('use_standard')}
              </Button>
            ) : null}
          </div>
        )}

        <div className="bg-background/20 space-y-4 border-t px-4 py-2 shadow-lg backdrop-blur-lg sm:rounded-t-xl sm:border md:py-4">
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
        </div>
      </div>
    </div>
  );
}
