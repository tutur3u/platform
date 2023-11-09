import { UseChatHelpers } from 'ai/react';
import Textarea from 'react-textarea-autosize';

import { Button } from '@/components/ui/button';
import { IconArrowElbow } from '@/components/ui/icons';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit';
import { useEffect, useState } from 'react';

export interface PromptProps
  extends Pick<UseChatHelpers, 'input' | 'setInput'> {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onSubmit: (value: string) => Promise<void>;
  isLoading: boolean;
  edge?: boolean;
}

export function PromptForm({
  onSubmit,
  input,
  inputRef,
  setInput,
  isLoading,
  edge,
}: PromptProps) {
  const { formRef, onKeyDown } = useEnterSubmit();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!input?.trim()) return;
        setInput('');
        await onSubmit(input);
      }}
      ref={formRef}
    >
      <div className="bg-background flex max-h-60 w-full overflow-hidden p-2 pl-4 sm:rounded-md sm:border">
        <Textarea
          ref={inputRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message."
          spellCheck={false}
          className="placeholder-foreground/50 w-full resize-none bg-transparent py-2 focus-within:outline-none sm:text-sm"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              disabled={isLoading || input === ''}
              size={edge ? 'icon' : undefined}
            >
              {edge || <div className="mr-1 text-sm">Standard</div>}
              <IconArrowElbow />
              <span className="sr-only">Send message</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Send message</TooltipContent>
        </Tooltip>
      </div>
    </form>
  );
}
