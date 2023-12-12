'use client';

import { type Message } from 'ai';

import { Button } from '@/components/ui/button';
import { IconCheck, IconCopy } from '@/components/ui/icons';
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard';
import { cn } from '@/lib/utils';

interface ChatMessageActionsProps extends React.ComponentProps<'div'> {
  message: Message;
}

export function ChatMessageActions({
  message,
  className,
  ...props
}: ChatMessageActionsProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });

  const stripFollowUp = (text: string) => {
    // Remove all text that follows the @<FOLLOWUP>...</FOLLOWUP> tag
    return text.replace(/@<FOLLOWUP>[\s\S]*<\/FOLLOWUP>/, '');
  };

  const onCopy = () => {
    if (isCopied) return;
    const content = stripFollowUp(message.content);
    copyToClipboard(content.trim());
  };

  return (
    <div
      className={cn(
        'flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100',
        className
      )}
      {...props}
    >
      <Button variant="ghost" size="icon" onClick={onCopy}>
        {isCopied ? <IconCheck /> : <IconCopy />}
        <span className="sr-only">Copy message</span>
      </Button>
    </div>
  );
}
