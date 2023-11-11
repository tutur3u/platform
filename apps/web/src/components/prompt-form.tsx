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
      <div className="bg-background/70 flex max-h-60 w-full items-end overflow-hidden rounded-lg p-2 pl-4 sm:border">
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              disabled={isLoading || input === ''}
              size="icon"
            >
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
