import { type UseChatHelpers } from 'ai/react';

import { Button } from '@/components/ui/button';
import { PromptForm } from '@/components/prompt-form';
import { ButtonScrollToBottom } from '@/components/button-scroll-to-bottom';
import { IconRefresh, IconStop } from '@/components/ui/icons';

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
  inputRef: React.RefObject<HTMLTextAreaElement>;
  createChat: (input: string) => Promise<void>;
}

export function ChatPanel({
  id,
  isLoading,
  stop,
  append,
  reload,
  input,
  inputRef,
  setInput,
  createChat,
  messages,
}: ChatPanelProps) {
  return (
    <div className="from-background/10 to-muted/50 fixed inset-x-0 bottom-0 bg-gradient-to-b">
      <ButtonScrollToBottom />
      <div className="mx-auto sm:max-w-4xl sm:px-4">
        <div className="mb-2 flex h-10 items-center justify-center">
          {isLoading ? (
            <Button
              variant="outline"
              onClick={() => stop()}
              className="bg-background"
            >
              <IconStop className="mr-2" />
              Stop generating
            </Button>
          ) : (
            messages?.length > 0 && (
              <Button
                variant="outline"
                onClick={() => reload()}
                className="bg-background"
              >
                <IconRefresh className="mr-2" />
                Regenerate response
              </Button>
            )
          )}
        </div>
        <div className="bg-background space-y-4 border-t px-4 py-2 shadow-lg sm:rounded-t-xl sm:border md:py-4">
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
