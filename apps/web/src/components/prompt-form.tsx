import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import { Button } from '@repo/ui/components/ui/button';
import { IconArrowElbow } from '@repo/ui/components/ui/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { cn } from '@repo/ui/lib/utils';
import { UseChatHelpers } from 'ai/react';
import { Mic, Paperclip, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Textarea from 'react-textarea-autosize';

export interface PromptProps
  extends Pick<UseChatHelpers, 'input' | 'setInput'> {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onSubmit: (value: string) => Promise<void>;
  isLoading: boolean;
}

export function PromptForm({
  onSubmit,
  input,
  inputRef,
  setInput,
  isLoading,
}: PromptProps) {
  const router = useRouter();
  const { formRef, onKeyDown } = useEnterSubmit();

  const [isInternalLoading, setIsInternalLoading] = useState(isLoading);

  useEffect(() => {
    setIsInternalLoading(isLoading);
  }, [isLoading]);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!input?.trim()) return;
        setInput('');
        await onSubmit(input);
      }}
      ref={formRef}
      className="w-full"
    >
      <div className="bg-background/70 flex max-h-60 w-full items-end overflow-hidden rounded-lg border p-2 pl-4">
        <Textarea
          ref={inputRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message."
          spellCheck={false}
          maxRows={7}
          className="placeholder-foreground/50 scrollbar-none w-full resize-none bg-transparent py-2 focus-within:outline-none sm:text-sm"
        />
        <div className="flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                disabled
                // disabled={isInternalLoading}
                size="icon"
                variant="ghost"
                className={cn('transition duration-300')}
              >
                <Paperclip />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add attachments</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                disabled
                // disabled={isInternalLoading}
                size="icon"
                variant="ghost"
                className={cn(
                  'transition duration-300',
                  input ? 'mx-1 md:mr-0' : 'ml-1'
                )}
              >
                <Mic />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Voice input</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger className="hidden md:flex" asChild>
              <Button
                disabled={isInternalLoading}
                size="icon"
                variant="ghost"
                className={cn(
                  'transition duration-300',
                  input ? 'mx-1' : 'ml-1'
                )}
                onClick={() => {
                  setIsInternalLoading(true);
                  router.refresh();

                  setTimeout(() => {
                    setIsInternalLoading(false);
                  }, 1000);
                }}
              >
                <RefreshCw
                  className={isInternalLoading ? 'animate-spin' : ''}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh Chat</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                disabled={isInternalLoading || !input}
                size="icon"
                className={cn(
                  'transition-all duration-300',
                  !input
                    ? 'opacity-0 bg-transparent w-0 text-transparent pointer-events-none'
                    : 'opacity-100 pointer-events-auto w-10'
                )}
              >
                <IconArrowElbow />
                <span className="sr-only">Send message</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </form>
  );
}
